# agent-gui Cursor-style Agent Harness 重构方案

> **Status:** in progress (Phase 0–4 largely landed; Phase 5 partial) · **Date:** 2026-06-19  
> **动机：** L1 语义裁剪实践证明易丢信息；主流（Cursor / Claude Code / OpenAI Agents SDK）采用 **动态发现 + 落盘大输出 + 时间维度压缩**，而非写入时硬裁 JSON。本方案将 QuickerAgent 的 agent runtime 收敛为可测试、可观测的 **Harness**，与 UI/持久化解耦。

**相关文档：**

- [agent-gui-prompt-structure.md](../../agent-gui-prompt-structure.md)（现状 prompt 拼装）
- [2026-06-14-agent-gui-context-compression-v2-design.md](../specs/2026-06-14-agent-gui-context-compression-v2-design.md)（L2 已实现部分）
- [2026-06-16-agent-vision-master-plan.md](../plans/2026-06-16-agent-vision-master-plan.md)（产品波次）
- Cursor：[Dynamic context discovery](https://cursor.com/blog/dynamic-context-discovery)、[Self-summarization](https://cursor.com/blog/self-summarization)

---

## 1. 设计原则（对齐 Cursor）

| 原则 | Cursor 做法 | QuickerAgent 目标 |
|------|-------------|-------------------|
| **动态优于静态** | MCP 工具描述落文件夹、按需 `grep`；Skills 目录化 | 工具 schema / skill / MCP 描述 **最小静态 + 按需发现** |
| **大输出落盘** | Shell/MCP 写文件，`tail`/`read` 续读 | Shell 超大 stdout、MCP 巨型 JSON → **artifact 文件 + 指针** |
| **不 truncate 丢数据** | 明确反对 shell/MCP truncate | **禁止** L1 字段级硬裁作为默认路径 |
| **时间维度压缩** | 近端全量 + 远端 summary；history 可搜索 | **滑动窗口** tool output + **L2 摘要** + 可选 history artifact |
| **UI ≠ Model** | Context Usage 分 category | **三层视图**：`display` / `model` / `archive` |
| **可观测** | `/context` 分解 token | Harness 暴露 `TurnContextReport`（类 Context Usage） |
| **有损要可恢复** | Chat history 文件 + summary 后搜索 | SQLite 全量 + `.local/agent-artifacts/` + summary 带指针 |

---

## 2. 目标架构

### 2.1 分层

```text
┌─────────────────────────────────────────────────────────────────┐
│  UI Layer (components/chat, tool-test)                          │
│  - AgentUIMessage 全量展示、审批、Context Usage 面板            │
└───────────────────────────────┬─────────────────────────────────┘
                                │ ChatRequest / ChatResponse
┌───────────────────────────────▼─────────────────────────────────┐
│  API Boundary (app/api/chat/route.ts — 薄路由)                  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│  AgentHarness (lib/agent-harness/)                              │
│  runTurn(TurnRequest) → TurnResult                              │
└───┬─────────┬─────────┬─────────┬─────────┬─────────────────────┘
    │         │         │         │         │
    ▼         ▼         ▼         ▼         ▼
 Static    Dynamic   Tools    Context   Stream
 Context   Context   Router   Pipeline  Loop
```

### 2.2 核心类型（建议）

```typescript
// lib/agent-harness/types.ts

export type TurnRequest = {
  messages: AgentUIMessage[];
  chatMode: ChatMode;
  cwd: string;
  llmSelection: LlmSelection;
  enabledToolIds: string[];
  actionScope: ActionScopeHint;
  actionDesigner?: ActionDesignerContext;
  titleManual?: boolean;
  titleTest?: boolean;
  /** dev-only */
  contextCompressionForce?: boolean;
};

export type TurnContextReport = {
  contextWindowTokens: number;
  estimatedInputTokens: number;
  categories: Array<{ id: string; label: string; tokens: number }>;
  compression?: ContextCompressionMetadata;
};

export type TurnResult = {
  stream: ReadableStream; // UIMessage stream
  contextReport?: TurnContextReport;
};
```

### 2.3 目录结构（新增 `lib/agent-harness/`）

```text
lib/agent-harness/
  index.ts                 # runTurn 入口
  types.ts
  static-context.ts        # instructions, skills catalog, cwd, rules 索引
  dynamic-context.ts       # scope, designer, launcher cache, slash, title
  tool-router.ts           # selectTools + intent filter（从 route 迁入）
  context-pipeline.ts      # 统一 L2 + sliding window + reactive
  stream-loop.ts           # streamText + prepareStep + reactive retry
  context-report.ts        # TurnContextReport 构建
  artifacts/
    store.server.ts        # 大输出落盘 (.local/agent-artifacts/)
    shell-artifact.ts      # shell 输出写文件 + 返回指针
    types.ts
```

**迁移策略：** 旧文件保留 re-export，逐 phase 迁实现，避免大爆炸 PR。

---

## 3. 上下文模型

### 3.1 三类上下文

| 类 | 内容 | 加载时机 | Cursor 对照 |
|----|------|----------|-------------|
| **Static shell** | Role、通信规范、cwd、skill **目录**（非全文） | 每 turn 开头，token 预算固定 | System prompt + skill names |
| **Dynamic pins** | `@action` scope、designer embed、launcher cache、L2 `systemSuffix` | 按 mode/用户输入 | Rules / pins |
| **Discovered** | 工具 schema、skill 正文、docs、文件内容、artifact tail | **Agent 调工具时**拉入 | Dynamic context discovery |

### 3.2 Static shell 瘦身（Phase 2）

**现状问题：** Rules + Skills + Tool definitions 常占 15K–25K+（见 Context Usage 实测）。

**目标：**

1. **Tool definitions** — 静态只保留「工具族索引表」（name + 一行用途 + discovery hint），完整 `inputSchema` 通过 `workspace_program` / 内置 **tool catalog 资源** 按需读（对齐 Cursor MCP 文件夹）。
2. **Skills** — 保持 tier-1 catalog；tier-2 `quicker-authoring` 改为 **首轮不注入全文**，改为「需要编写时 `docs get` / skill load」。
3. **Rules** — `AGENTS.md` 只注入 **路径索引 + 前 2KB 摘要**；全文用 Read 工具。
4. **MCP**（若接入）— 同步到 `.local/mcp-tools/<server>/` 目录树。

**预算目标：** Static shell ≤ **8K tokens**（当前常 20K+）。

### 3.3 消息管线（Model-facing）

```text
UIMessage[] (persisted, 全量)
  → repairInterruptedToolCalls
  → expandUserMessageForModel
  → ContextPipeline.prepare({
       messages,
       contextLimit,
       policy: DEFAULT_CONTEXT_POLICY,
     })
       ├─ [可选] SlidingWindowTrim (旧 turn tool output → preview)
       ├─ microcompact placeholders (旧 round 大 part)
       ├─ strip displayData
       ├─ convertToModelMessages
       └─ [若超阈值] L2 summarize + recent slice
  → ModelMessage[] + systemSuffix
```

**关键：** `prepare()` **不修改** persisted UIMessage；只产出 **本轮 model 视图**（与 OpenAI `ToolOutputTrimmer` 一致）。

---

## 4. 工具输出策略（替代 L1 硬裁）

### 4.1 默认策略矩阵

| 工具类型 | 写入 UIMessage | 送入 Model（同 turn） | 旧 turn |
|----------|----------------|----------------------|---------|
| **自研小结果** | 完整 structured | 同左（无 displayData） | sliding preview 或 microcompact |
| **Shell / 大 MCP** | structured + **artifact ref** | 指针 + tail 预览 | preview only |
| **Read / grep** | 完整（分页） | 同左 | microcompact + refetch hint |
| **Write** | 完整（UI） | **无 content echo**（仅 path/bytes） | 占位 |
| **qkrpc debug** | traceRef + stepSummaries | 同左 | 占位 |

### 4.2 Artifact 子系统

**路径：** `{cwd}/.local/agent-artifacts/{threadId}/{toolCallId}.txt`（或 `.json`）

**Shell 返回示例：**

```json
{
  "ok": true,
  "data": {
    "action": "shell",
    "artifactPath": ".local/agent-artifacts/.../call-abc.txt",
    "bytesWritten": 120000,
    "tailPreview": "...(last 2KB)...",
    "readHint": "Read artifactPath with startLine/endLine or grep"
  }
}
```

**与 Cursor 对齐：** 终端会话同步为文件（Cursor 已做 integrated terminal → file）。

### 4.3 L1 语义压缩（`formatToolResultForAgent`）

| 阶段 | 策略 |
|------|------|
| **Phase 0（当前）** | L1 压缩 **默认开启**（`TOOL_RESULT_AGENT_VIEW_COMPRESSION=0` 可关）；始终整形：grep 按路径合并、step_runner search snippet 截断 |
| **Phase 3** | 仅保留 **artifact 路由 + write omit content**；删除 grep/docs 等字段级 truncate |
| **长期** | `formatToolResultForAgent` 改名为 `normalizeToolResult`（规范化，非压缩） |

### 4.4 Sliding window（对齐 OpenAI ToolOutputTrimmer）

**新模块：** `lib/agent-harness/sliding-window-trim.ts`

- 参数：`recentUserTurns=2`，`maxToolOutputChars=8000`，`previewChars=2000`
- 仅处理 **早于边界** 的 tool result parts
- **不 mutate** 存储；在 `ContextPipeline` 内对 `ModelMessage[]` 做浅拷贝替换
- 可配置 `trimmableTools: Set<string>`

### 4.5 L2 会话压缩（保留并增强 v2）

保留 `context-compression-shared.ts` 阈值逻辑。

**增强（Cursor 对齐）：**

1. **History artifact** — 压缩前将 `messages[0..splitIndex]` 写入 `.local/agent-history/{threadId}/{ts}.jsonl`
2. Summary prompt 注入 `historyArtifactPath`，允许模型 **search/grep 历史** 补细节
3. **手动 compact** — API `POST /api/chat/compact` 或客户端按钮（对标 `/summarize`）
4. **Compaction 焦点** — `compactFocus: "auth bug"` 参数（对标 `/compact focus on ...`）

### 4.6 Step 内 microcompact（补齐未接线）

将 `createStepMicrocompactPrepareStep` **接入** `stream-loop.ts` 的 `prepareStep`（多步 tool 同一 turn 内压旧 tool result）。

---

## 5. Harness 执行流

```text
runTurn(request)
  │
  ├─ resolveModel(selection)
  ├─ static = buildStaticContext({ cwd, chatMode })
  ├─ dynamic = buildDynamicContext({ scope, designer, launcher, messages, ... })
  ├─ tools = toolRouter.select({ chatMode, enabledIds, turnState, userText })
  │
  ├─ [launcher] tryDirectResponse? → early return
  │
  ├─ prepared = contextPipeline.prepare(messages, contextLimit, model)
  ├─ system = composeSystem(static, dynamic, prepared.systemSuffix)
  ├─ report = buildContextReport(system, prepared, tools)
  │
  └─ streamLoop({
       model, system,
       messages: prepared.modelMessages,
       tools,
       prepareStep: stepMicrocompact,
       onContextLengthError: reactiveCompactOnce,
     })
```

**`route.ts` 目标形态（<80 行）：**

```typescript
export async function POST(req: Request) {
  const body = await parseChatRequest(req);
  const result = await runTurn(body);
  return createUIMessageStreamResponse({ stream: result.stream });
}
```

---

## 6. 工具系统重构

### 6.1 单源注册

**问题：** `tool-registry.ts`（元数据）与 `tools.ts`（execute）双维护。

**目标：**

```text
lib/tools/
  registry.ts          # 合并：id, meta, zod schema, execute ref, artifactPolicy
  policies.ts          # per-tool: artifact | omit-fields | paginate
  quicker.ts           # 聚合导出 quickerTools
```

`tool-registry.ts` 的 L2 路由表保留，但 **从 registry 自动生成** 或同文件定义。

### 6.2 显式 TurnContext（替代 AsyncLocalStorage）

**现状：** `qkrpc-request-context.ts` 隐式传递 cwd/scope。

**目标：**

```typescript
export type ToolExecutionContext = {
  cwd: string;
  chatMode: ChatMode;
  actionScope: ActionScopeHint;
  threadId?: string;
  artifactDir: string;
};

// tool.execute(input, ctx) 或 wrapToolMap(ctx)
```

`AsyncLocalStorage` 仅作 **兼容层**，Phase 4 移除。

### 6.3 结果形状统一

```text
ToolExecuteResult
  ├─ structured: StructuredToolResult  // 持久化 + UI
  ├─ modelFacing: unknown              // 送 LLM（默认 = strip displayData）
  └─ artifact?: ArtifactRef             // 可选大对象
```

`toModelOutput` / `buildModelFacingToolOutput` 合并为 **`toModelPayload(result)`** 单入口。

---

## 7. 持久化与线程模型

### 7.1 不变

- SQLite `chats.db` 存 **全量** `AgentUIMessage`（含 tool output 全 JSON）
- 懒加载 messages API

### 7.2 新增

| 存储 | 内容 |
|------|------|
| `threads.metadata.contextReports[]` | 每 turn 摘要（可选，调试用） |
| `.local/agent-artifacts/` | 大输出文件 |
| `.local/agent-history/` | L2 压缩前 history 快照 |

### 7.3 服务端 thread 感知

`route.ts` 接收 `threadId`，用于 artifact 路径与 history 文件命名；**不在服务端维护 thread 状态机**（仍客户端传 messages）。

---

## 8. UI 重构（Phase 5+）

### 8.1 `Chat.tsx` 拆分

```text
components/chat/
  ChatContainer.tsx       # 布局、thread 切换
  ChatTransport.tsx       # useChat + transport body
  ChatPersistence.tsx     # debounce flush → chat-store
  ChatComposer.tsx        # 输入、模型选择
  ChatMessageList.tsx
  ContextUsagePanel.tsx   # 对接 TurnContextReport API
```

### 8.2 Context Usage（对标 Cursor）

- 数据来源：`GET /api/chat/context-report?threadId=` 或 turn 结束 metadata
- Categories：`system_prompt | tool_index | rules | skills | conversation | summarized | artifacts`
- 工具调用成对展示（input + output tokens）

### 8.3 Tool 弹窗

- 默认：**Display** 全量
- Tab：**Model payload**（本轮实际送入 LLM 的 JSON）
- 大输出：**Open artifact file** 链接

---

## 9. 与现有能力对照

| 模块 | 重构后归属 | 备注 |
|------|------------|------|
| `instructions.ts` | `static-context.ts` | 瘦身 |
| `agent-turn-runtime.ts` | `dynamic-context.ts` + `static-context.ts` | 拆分 |
| `context-compression*.ts` | `context-pipeline.ts` | 合并 |
| `tool-result-agent-view.ts` | `artifacts/` + 删除大部分 compressor | L1 退役 |
| `context-microcompact.ts` | `context-pipeline.ts` | 保留 |
| `context-step-microcompact.ts` | `stream-loop.ts` | **接线** |
| `chat-tool-selection.ts` | `tool-router.ts` | 保留逻辑 |
| `tool-test` L1 面板 | 改为 artifact + sliding window 演示 | 更新场景 |

---

## 10. 分阶段实施计划

### Phase 0 — 冻结与基线（1 周）

- [x] 默认 `TOOL_RESULT_AGENT_VIEW_COMPRESSION=0`
- [x] `agent-eval` 基线跑分 + token 统计脚本（`pnpm measure:static-shell` + `/api/dev/static-shell-baseline`）
- [x] Context Usage 面板接真实 `TurnContextReport`（`metadata.contextReport` + 分类条）

**验收：** eval 无回归；tool-test 标明 L1 默认关闭。（**L1 / Harness 面板已更新**）

### Phase 1 — Harness 骨架（2 周）

- [x] 新增 `lib/agent-harness/`，`runTurn` 从 `route.ts` 迁出（`runAgentChatTurn`）
- [x] `ContextPipeline` 包装现有 `prepareCompressedContext`（`prepareContextPipeline` + sliding window）
- [x] `stream-loop.ts` 包装现有 while/reactive + `prepareStep` microcompact
- [ ] 单元测试：`runTurn` mock model（部分：`harness-preview` / sliding-window 单测）

**验收：** `route.ts` <150 行（**现 ~18 行**）；现有 compression 测试全绿。

### Phase 2 — 动态静态瘦身（2–3 周）

- [x] **`list_tools` 元工具**（index / get / routing）；core routing 仍内联 system
- [x] Skill tier-2 改为 catalog 默认（`HARNESS_PRELOAD_SKILLS=1` 恢复全文）
- [x] Rules 摘要化（`HARNESS_WORKSPACE_RULES_FULL=1` 恢复 AGENTS.md 全文）
- [x] Extended tool schema 瘦身（`HARNESS_SLIM_TOOL_SCHEMAS=1`；core 保留完整 schema；extended 经 `list_tools action=get`）
- [ ] 测量 static shell tokens ≤ 8K（`pnpm measure:static-shell` 可观测；开启 slim schemas 后对比 tool tokens）

**验收：** Context Usage 中 tools+rules+skills 合计降 40%+；authoring benchmark 不降分。

### Phase 3 — Artifact + Sliding Window（2–3 周）

- [x] Shell 大输出落盘 + tail preview（`.local/agent-artifacts/{threadId}/{toolCallId}.txt`）
- [x] `sliding-window-trim.ts` 接入 `ContextPipeline`
- [x] Write：model 侧 omit content（保留）
- [ ] 删除/归档 L1 compressors — L1 默认关，代码仍保留供 tool-test 对比

**验收：** tool-test shell-large 场景 artifact 路径；长会话 token 曲线平缓。

### Phase 4 — L2 增强 + Step microcompact（2 周）

- [x] History artifact 写入 + summary 指针（`.local/agent-history/`）
- [x] `prepareStep` 接线 step microcompact（`stream-loop.server.ts`）
- [x] 手动 `POST /api/chat/compact`（dev）
- [x] 显式 `ToolExecutionContext`（`buildToolExecutionContext` + ALS `threadId`/`artifactDir`）

**验收：** context-compression integration test；多步 tool turn 不超窗。

### Phase 5 — UI 与可观测（2 周）

- [x] `Chat.tsx` 拆分（**部分**：`useAgentChatSession` + `agent-chat-transport`）
- [x] Context Usage：`TurnContextReport` 分类 + history artifact 打开
- [x] Tool 弹窗 Display / Model / Artifact 三视图（`ToolModelPayloadPanel` + artifact 按钮）

### Phase 6 — 工具注册单源（持续）

- [ ] `lib/tools/registry` 合并
- [ ] 文档更新 `agent-gui-prompt-structure.md`

---

## 11. 非目标（本重构不做）

- 替换 Vercel AI SDK / 自研 streaming 协议
- 复刻 Cursor Composer 自训练摘要模型
- 服务端 thread 状态机（仍客户端传全量 messages）
- Quicker Plugin / qkrpc 协议变更
- 合并 `cursor-sdk` 与 Quicker harness（保持 eval 双轨，仅统一 **契约测试**）

---

## 12. 成功指标

| 指标 | 目标 |
|------|------|
| Static context（无对话） | ≤ 8K tokens |
| 50 turn tool-heavy 会话 | 无 reactive compact 失败 |
| authoring benchmark | 分数不低于 Phase 0 基线 |
| Shell 100KB 输出 | 模型 payload < 4K（artifact） |
| `route.ts` 行数 | < 100 |
| Harness 单元测试 | coverage 核心路径 |

---

## 13. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 静态瘦身导致模型「不知道能调什么工具」 | 保留工具族索引 + eval 回归；逐步放量 |
| Artifact 路径泄露 / 安全 | 限制在 cwd `.local/`；shell 策略不变 |
| L2 摘要仍失忆 | history artifact + 指针；用户手动 compact |
| 大重构回归 | Phase 边界清晰；每 phase 可 ship |
| Electron 路径与 cwd | artifact 用 workspace-relative 路径 |

---

## 14. 开放问题（实施前需决策）

1. **Tool schema 动态发现** — **已决策：引入 `list_tools` 元工具**（core routing 仍内联；extended 经 `action=routing|get`）。
2. **threadId 服务端缓存** — **暂不**：`TurnContextReport` 挂 assistant `metadata`，不默认写 threads DB。
3. **Launcher** — 是否独立 `LauncherHarness` 子类，还是 `chatMode` 分支保留在单 harness？
4. **DeepSeek 等长窗模型** — compaction budget 128K vs API 1M（已采用 128K 预算）是否写入 `ContextPolicy` 配置？

---

## 15. 下一步

1. ~~评审本 spec（特别是 Phase 2 静态瘦身幅度）~~
2. **agent-eval token 基线** — 运行 `pnpm measure:static-shell`，对照 8K system 目标迭代
3. **Phase 6** 工具注册单源；**Phase 4** 显式 `ToolExecutionContext`
4. **Chat.tsx** 继续拆：`ChatMessageList` / composer 层（session 层已抽出）
