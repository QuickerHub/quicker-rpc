# agent-gui 上下文压缩 v2 — 设计规格

> **Status:** approved · **Date:** 2026-06-14  
> **动机：** 当前 `prepareCompressedContext` 用固定「最近 12 条 message + LLM 摘要」策略，在 tool -heavy 会话中易失忆、易漏触发；需改为 **token 预算驱动 + 分层压缩**，尽量保留有效上下文。

---

## 1. 目标与非目标

| 目标 | 说明 |
|------|------|
| **最大化信息保留** | 在 context window 内，优先保留近端完整 tool 链与关键 identifier |
| **可预测触发** | 按 measured usage / token 估算触发；**不依赖** `messages.length > 12` |
| **分层降损** | 先缩旧 tool 正文（microcompact），仍超预算再 LLM 摘要 |
| **可观测** | `previewContextCompression` 与 UI 展示 split 依据（token / round） |
| **向后兼容** | 已有 `contextCompression` metadata 仍可复用；SQLite 全量 history 不变 |

**Non-goals（本阶段不做）**

- 完整复刻 cc-haha 的 Agent Teams / fork / AsyncLocalStorage
- Anthropic prompt cache / contentReplacementState
- 每 tool step 内的 autocompact（需改 `streamText` 外层 loop，单列后续 Phase）
- 修改 Quicker 主仓库或 qkrpc 协议

---

## 2. 现状问题（摘要）

```text
触发: splitIndex > 0 (即 >12 条) AND inputTokens >= ~90% window
保留: messages.slice(-12) 完整 + systemSuffix 摘要
摘要: reasoning 丢弃；tool 缩成 state=；输出 max 700 tokens
```

| 问题 | 后果 |
|------|------|
| 条数 ≠ token | 12 条 tool 输出可占满窗口；或 13 条短句无必要摘要 |
| ≤12 条不压 | 大 tool 会话撞窗但不触发压缩 |
| 一跳 LLM 摘要 | 远端细节丢失，agent「失忆」 |
| 摘要输入过度截断 | actionId / patch 要点进不了 summary |

---

## 3. 目标架构

```text
POST /api/chat
    │
    ▼
prepareCompressedContext (v2)
    │
    ├─► [L0] estimateMessageTokens / groupApiRounds
    │
    ├─► shouldCompress? (usage >= 90% OR estimate >= 92%)
    │       └─ 移除 splitIndex>0 硬门槛；改为 recentBudget 可切分即可
    │
    ├─► [L1] microcompactToolParts(messages) — 仅旧 round 的 tool output 正文
    │       └─ 不改变 message 条数；降低 token 后再评估是否仍需 L2
    │
    ├─► resolveContextSplitIndex (v2) — token budget 从尾部累加
    │       recentBudget = contextLimit * RECENT_BUDGET_RATIO - headroom
    │       minMessages = MIN_RECENT_MESSAGES (fallback 下限)
    │       maxMessages = MAX_RECENT_MESSAGES (fallback 上限，默认 24)
    │
    ├─► [L2] summarize older slice (reuse metadata 或 LLM)
    │       └─ 结构化 summary prompt + MAX_SUMMARY_OUTPUT_TOKENS 提升
    │
    └─► modelMessages = recent slice (+ microcompact 后的 parts)
        systemSuffix = summary
        metadata.contextCompression (throughMessageId, recentTokensKept, …)
```

### 3.1 常量（初值，可 env 覆盖）

| 常量 | 值 | 含义 |
|------|-----|------|
| `COMPACTION_HEADROOM_TOKENS` | 4096 | 保留（现有） |
| `USAGE_TRIGGER_RATIO` | 0.9 | 保留（现有） |
| `RECENT_BUDGET_RATIO` | 0.45 | 近端完整保留占总 window 比例 |
| `MIN_RECENT_MESSAGES` | 4 | 至少保留 4 条（2 轮量级） |
| `MAX_RECENT_MESSAGES` | 24 | 防止近端仍爆窗 |
| `MICROCOMPACT_MIN_AGE_ROUNDS` | 2 | 最近 2 个 API round 不 microcompact |
| `MAX_SUMMARY_OUTPUT_TOKENS` | 1800 | 从 700 提升 |
| `MAX_SUMMARY_SOURCE_CHARS` | 24000 | 从 18000 提升 |

### 3.2 API round 分组

一轮定义为从 **user** 消息开始，到下一个 **user** 之前（含中间 assistant + tools）。

用于：

- microcompact 跳过最近 N 轮
- split 时优先在 round 边界切（避免 orphan tool_result）

### 3.3 Microcompact 规则

对 **早于 split 边界** 的 tool parts（`state === output-available'`）：

- 保留：`toolCallId`, `type`, 结构化 `output` 中的 `actionId` / `path` / `ok` / `errorMessage`（各工具 small extractor）
- 替换：大段 stdout、patch body、file content → `[compact: N chars omitted, see recent turns]`
- **不** microcompact：最近 2 round；`ask_question` 未闭合；用户 pin 的 action scope 相关 message

### 3.4 摘要 prompt（结构化）

输出固定 section（中文 bullet）：

1. 用户目标与约束  
2. 关键 actionId / 文件路径 / 设置项  
3. 已完成决策与 tool 结果要点  
4. 失败与 retry  
5. 未完成任务  

### 3.5 触发条件变更

```typescript
// v2: 可压缩当且仅当
canSplit = resolveContextSplitIndex(messages, contextLimit) > 0
shouldCompress = canSplit && (force || shouldCompressContextMessages(...))
```

`resolveContextSplitIndex` **不再**使用固定 `12`；返回 `{ splitIndex, recentTokenEstimate, splitReason }`。

`splitIndex > 0` 含义变为：「存在可摘要的旧 slice」，即 token 累加未吞没全部消息。

### 3.6 Metadata 扩展（兼容）

```typescript
type ContextCompressionMetadata = {
  summary: string;
  throughMessageId: string;
  sourceInputTokens: number;
  createdAt: number;
  recentMessagesKept: number;      // 保留
  totalMessagesAtCreation: number;
  // v2 optional:
  recentTokensEstimate?: number;
  splitReason?: "token_budget" | "message_cap" | "legacy_12";
  microcompactApplied?: boolean;
  summaryReused?: boolean;
};
```

旧客户端忽略新字段。

---

## 4. 方案对比（已选）

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| A. 仅改 12→24 | 改动极小 | 不解决 token 不均 | ❌ |
| B. token budget split + 原摘要 | 保留近端信息量合理 | 远端仍一次丢光 | ⚠️ Phase 1 |
| **C. B + microcompact + 结构化摘要** | 分层、可测、对齐 cc-haha 思路 | 实现量中等 | ✅ **选用** |
| D. 完整 queryLoop 每 step 压缩 | 最强 | 需重构 chat route | 后续 Phase 5 |

---

## 5. 测试策略

| 层级 | 命令 / 入口 |
|------|-------------|
| 单元 | `pnpm test:context-compression` |
| 场景 | `/tool-test` Context Compression 面板 + 更新 scenarios |
| Dev API | `POST /api/dev/context-compression` |
| 手工 | 长 thread + 大 shell_exec 输出，确认不失忆 actionId |

必覆盖用例：

1. 8 条 message + 高 token → 应触发（v1 不触发）  
2. 30 条短 message + 低 token → 不触发  
3. microcompact 后 usage 降至阈值下 → 跳过 LLM summary  
4. `throughMessageId` 复用 summary  
5. DeepSeek reasoning history 仍在 recent slice 完整保留  

---

## 6. 文档更新

- `docs/agent-gui-prompt-structure.md` § Context compression  
- `docs/agent-gui-chat-storage.md` metadata 字段说明  

---

## 7. 验收标准

- [x] 固定 12 条逻辑移除，split 由 token budget 驱动  
- [x] tool-heavy 短线程（≤12 条）在 90% usage 时可压缩  
- [x] microcompact 单元测试覆盖 qkrpc + workspace + shell  
- [x] 摘要复用仍零额外 LLM 调用  
- [x] `previewContextCompression` 暴露 `splitReason` / `recentTokensEstimate`  
- [x] 现有 `test:context-compression` 全绿 + 新增用例  

---

## 8. 后续（本 spec 范围外）

- ~~Phase 5：`streamText` 外层 turn loop + step 间 microcompact~~ → `context-step-microcompact.ts` + `prepareStep`（2026-06-14）
- ~~Phase 6：reactive compact（provider context length error 重试）~~ → `context-compression-reactive.ts`（2026-06-14）
- ~~Phase 7：post-compact reinject（最近 patch 文件片段）~~ → `context-compaction-reinject*.ts`（2026-06-14）
