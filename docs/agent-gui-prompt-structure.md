# QuickerAgent Prompt 结构

> 面向维护者：说明 agent-gui 如何把静态指令、预加载 skill、运行时上下文与工具描述组装成发给 LLM 的完整 prompt。

## 总览

一次 `/api/chat` 请求的最终 **`system`** 由多块拼接；**`messages`** 经用户消息展开与（可选）上下文压缩后送入模型。工具参数细节在各自 **`tool.description` / `inputSchema`** 中，不在 system 里重复。

```
┌─────────────────────────────────────────────────────────────┐
│ system（按顺序 join "\n\n"，空块跳过）                        │
├─────────────────────────────────────────────────────────────┤
│ 1. [可选] title-test 模式声明                                │
│ 2. buildSystemInstructions(cwd, chatMode)                   │
│    ├─ Agent: SYSTEM_INSTRUCTIONS                              │
│    │     + Skill: action authoring (prompt-tier0)           │
│    │     + Topic index                                      │
│    │     + Post-patch summary                               │
│    │     + ## cwd                                           │
│    └─ Launcher: LAUNCHER_SYSTEM_INSTRUCTIONS (+ post-patch) │
│ 3. formatActionScopeForSystem(actionScope)  ← 对话上下文     │
│ 4. buildLauncherCommandCachePromptBlock     ← 仅 launcher     │
│ 5. buildThreadTitleAgentInstruction         ← 仅 agent 首条   │
│ 6. preparedContext.systemSuffix             ← 长对话压缩摘要  │
└─────────────────────────────────────────────────────────────┘

messages ← prepareCompressedContext(modelMessages)
         ← expandUserMessageForModel（user 文本内 tag → <qka>）
tools    ← pickChatTools(quickerTools, enabledTools, …)
```

组装入口：`agent-gui/app/api/chat/route.ts` → `buildSystemInstructions`（`lib/instructions.ts`）。

---

## 1. 静态 System 基座

| 模式 | 常量 | 源文件 | 用途 |
|------|------|--------|------|
| **Agent**（默认） | `SYSTEM_INSTRUCTIONS` | `agent-gui/lib/instructions.ts` | 通用助手：Role、Communication、Runtime、Capabilities、Skills 路由 |
| **Launcher** | `LAUNCHER_SYSTEM_INSTRUCTIONS` | 同上 | 全局快捷键轻量面：快速执行、短回复、工具子集 |

模式由请求体 `chatMode` 决定（`agent-gui/lib/chat-mode.ts`）。

### Agent 基座章节

| 章节 | 内容要点 |
|------|----------|
| Role | Quicker 桌面 + 本机环境；先匹配意图再选工具 |
| Communication | 用户语言（默认中文）；不对用户暴露工具名/CLI/JSON |
| Runtime | qkrpc serve；侧栏 cwd = shell / qkrpc / workspace 根；`<qka id="uuid">` |
| Capabilities | 按域列出工具族（run、settings、local、layout、safety、dev UI） |
| Skills | action authoring 预加载；`docs get/search/index` 按需深读 |

### Launcher 基座差异

- 更短、强调「立即执行 + 一句结果」
- **Out of scope**：`workspace_program`、`qkrpc_step_runner_*`、`dev_frontend_check`、`llm_settings` 等多步编写
- 含 `ACTION_LINK_SUMMARY_PROMPT`（patch 后摘要规则）
- 工具集固定为 `LAUNCHER_TOOL_IDS`（`chat-mode.ts`），最多 12 步

---

## 2. 预加载 Skill：action authoring

Agent 模式下 **始终注入**（Launcher 不注入）。由 `formatAuthoringSkillForPrompt()`（`lib/action-authoring-docs.ts`）生成两块：

### Tier 0 — Router（热路由）

| 项 | 说明 |
|----|------|
| 源（生成前） | `docs/action-authoring-src/skills/quicker-authoring/prompt-tier0.src.md` |
| 源（运行时读） | `docs/skills/quicker-authoring/prompt-tier0.md` |
| 回退 | `docs/skills/quicker-authoring/SKILL.md`（无 tier0 时） |
| 包装 | 前缀 `## Skill: action authoring` + scope 一句 + 后缀「Stuck → docs get」 |

内容：意图→工具/docs 路由表、P0–P7 流水线、Hard rules、workspace 热 schema 片段（partial 展开后）。

### Tier 1 — Topic index（目录）

`formatAuthoringTopicIndexForPrompt()` 从 `docs/skills/quicker-authoring/topics.json` 按 layer 分组列出 topic + description + reference 子路径，供 Agent **`docs({ action: "get", topic })`** 按需拉全文。

**设计原则**（skill 内写明）：session 开头 **不要** 批量 `docs get`；索引已在 system 中，卡住再读一个 topic。

### Post-patch summary

`ACTION_LINK_SUMMARY_PROMPT`（`lib/action-link-markup.ts`）：patch 成功后简短文字总结；**不要**输出 `<qka-link>`（UI 自动展示动作卡片）。

---

## 3. 运行时 System 附加块

| 块 | 条件 | 生成函数 | 内容 |
|----|------|----------|------|
| **cwd** | 有效工作目录已解析 | `buildSystemInstructions` | `## cwd` + `qkrpc cwd: {path}` |
| **Action scope** | 从 messages + 本地 `.quicker/actions` 提取 | `formatActionScopeForSystem` | 用户 `@` 动作、线程内最近动作 id、本地 project id 列表 |
| **Launcher cache** | `chatMode === launcher` 且命中缓存 | `buildLauncherCommandCachePromptBlock` | 相似历史指令与步骤，供复用 |
| **Thread title** | Agent 首条用户消息且未手动标题 | `buildThreadTitleAgentInstruction` | 要求调用隐藏工具 `set_thread_title` |
| **Context compression** | 上下文超模型预算 | `prepareCompressedContext` → `systemSuffix` | 旧轮次摘要 + 「以摘要为权威历史」 |

工作目录解析：`resolveEffectiveWorkingDirectory()`（侧栏设置 → 否则服务端默认：dev 为 repo 根，发布为 `Documents/QuickerAgent/workspace`）。

---

## 4. User Messages（非 system）

| 阶段 | 函数 | 作用 |
|------|------|------|
| 存储 | UI composer | 用户可见文本；动作 chip 存为 `<qkrpc-action-tag …>` |
| 送模前 | `expandUserMessageForModel` | tag / `<qka-link>` → `<qka id="uuid">Title</qka>` 行（`lib/compose-user-message.ts`） |
| 压缩 | `prepareCompressedContext` | 保留近期消息；更早轮次 LLM 摘要进 `systemSuffix` |

Action scope 与 user tag 共用 `<qka>` 解析（`lib/action-scope.ts`）。

---

## 5. 工具描述 = Prompt 延伸

System 只列 **工具族**；具体参数、枚举、示例在 **`lib/*-tool*.ts`** 的 `tool({ description, inputSchema })` 中。

| 类别 | 代表模块 |
|------|----------|
| 编写指南 | `docs-tool.server.ts` — get/search/index/reference |
| 工作区程序 | `workspace-program-tool.ts` + `workspace-program-tool.server.ts` |
| 动作 / 子程序 | `qkrpc-action-tool.server.ts`, `qkrpc-subprogram-tool.server.ts` |
| Step runner | `step-runner-tool.server.ts`（Agent only；禁止 get-ui） |
| 本地 | `shell-tool.ts`, `browser-tool.server.ts` |
| Launcher | `launcher-resolve-tool`, `launcher-command-cache-tool` |

UI 工具勾选 → `enabledTools` → `pickChatTools`；Launcher 忽略勾选，用固定列表。

---

## 6. Authoring 文档管线（与 prompt 的关系）

与 agent-gui system 注入相关的 **源模板** 在 `docs/action-authoring-src/`（勿直接改生成物）：

```
docs/action-authoring-src/
├── manifest/          topics.json, operations.json, phrases.json, skill.json
├── skills/quicker-authoring/
│   ├── SKILL.src.md           → docs/skills/quicker-authoring/SKILL.md
│   └── prompt-tier0.src.md    → docs/skills/quicker-authoring/prompt-tier0.md
├── partials/        pipeline-p0-p7, schema-hot-*, workflow-checklist-*
├── workflows/       authoring-workflow, workspace-editing, …
└── references/      docs get reference 深读

生成：node scripts/generate-authoring-docs.mjs --force
```

| Prompt 层级 | 文件 | 何时进入模型 |
|-------------|------|--------------|
| L0 基座 | `instructions.ts` | 每次 chat |
| L0.5 Tier0 router | `prompt-tier0.md` | Agent 每次 chat（system） |
| L1 Topic index | `topics.json` 展开 | Agent 每次 chat（system） |
| L2 Topic 全文 | `docs/action-authoring/agent/*.md` 等 | Agent 调用 `docs get` 时进 **tool result** |
| L3 Reference | `references/{topic}/*.md` | `docs get reference` |

CLI 消费者：`qkrpc guide get` 读 `docs/action-authoring/cli/`（同 manifest 另一 profile）。

---

## 7. 特殊模式

| 模式 | 触发 | System 差异 |
|------|------|-------------|
| **title-test** | `/tool-test` `titleTestOnly` | 仅 `set_thread_title` 工具 + `buildTitleTestChatInstruction` |
| **contextCompressionForce** | tool-test dev | 强制压缩（非 production） |
| **Launcher direct** | cache/resolve 命中 | 可能短路 stream，不经过完整 system 栈 |

---

## 8. 源文件索引

| 路径 | 职责 |
|------|------|
| `agent-gui/lib/instructions.ts` | System 基座 + `buildSystemInstructions` |
| `agent-gui/app/api/chat/route.ts` | 最终 system/messages/tools 组装 |
| `agent-gui/lib/action-authoring-docs.ts` | tier0 + topic index 注入 |
| `agent-gui/lib/action-scope.ts` | 动作上下文 system 块 |
| `agent-gui/lib/context-compression.ts` | 长对话摘要 suffix |
| `agent-gui/lib/set-thread-title-tool.ts` | 首条对话标题指令 |
| `agent-gui/lib/launcher/launcher-command-cache.server.ts` | Launcher 缓存 prompt 块 |
| `agent-gui/lib/compose-user-message.ts` | User 消息 tag 展开 |
| `agent-gui/lib/action-link-markup.ts` | Patch 后摘要 prompt 常量 |
| `agent-gui/lib/chat-mode.ts` | Agent / Launcher 工具与步数上限 |
| `docs/action-authoring-src/README.md` | Authoring 模板与 marker 语法 |

---

## 9. 维护提示

- 改 **通用行为**（语言、capabilities、runtime）→ `instructions.ts`
- 改 **编写路由 / P0–P7 / hard rules** → `prompt-tier0.src.md` → `docs:gen`
- 改 **topic 列表或分层** → `manifest/topics.json` → `docs:gen`
- 改 **工具参数** → 对应 `*-tool*.ts` 的 description/schema（system 仅保留一行指向）
- 新增 topic 流程见 `docs/action-authoring-src/README.md` § Add a topic
