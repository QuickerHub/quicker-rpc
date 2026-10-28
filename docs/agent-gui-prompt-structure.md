# QuickerAgent Prompt 结构

> 面向维护者：说明 agent-gui 如何把静态指令、预加载 skill、运行时上下文与工具描述组装成发给 LLM 的完整 prompt。

## 对话流（对齐 Cursor / Codex / Claude）

主流 coding agent 的上下文模型很简单：

1. **完整 messages** — 每轮把 UI 消息（含 tool call / tool result）转成 model messages 送入 LLM。
2. **System 与当前目录** — 角色和工作流参考加本轮最终工具目录；可用能力以当前定义和执行门禁为准，不从静态工具族补回。
3. **明确目标** — 消息中的动作 pin、Designer embed 与 live 文档范围分别提供目标上下文；普通动作提示不授予权限，live 操作还须遵守该轮冻结的文档授权和工具选择。
4. **窗口快满才压缩** — token 用量 ≥ **90%**（有 provider usage 时）或估算 ≥ **92%** 时，按 **token 预算**（约 45% 窗口 − 4K headroom）保留近端完整 messages，对更早轮次做 structured LLM 摘要进 `systemSuffix`；旧 round 的大 tool 输出可先 **microcompact**。若 provider 仍返回 context length / prompt too long，服务端 **reactive compact** 最多重试 1 次（`force: true`）。不做 `pruneMessages` 式无条件裁剪。

动作 id 以对话历史中的 tool 结果为准（如 `qkrpc_action_create` 返回的 `actionId`），不靠线程级状态机或本地 project 列表注入。

---

## 总览

一次 `/api/chat` 请求的最终 **`system`** 由多块拼接；**`messages`** 经用户消息展开与（可选）上下文压缩后送入模型。工具参数细节在各自 **`tool.description` / `inputSchema`** 中，不在 system 里重复。

`prepareAgentTurnRuntime` 先完成工具选择、MCP/live 组合、模式门禁和调用策略，再绑定
当前目录并生成唯一 TurnPlan。模型 schema 精简保留这些实际定义的说明；目录不会恢复
已被移除的工具。随后生成的 system 按下列顺序拼接，空块跳过：

1. 可选 title-test 与 benchmark 声明。
2. `buildSystemInstructions(cwd, mode, toolCatalog)`：Agent/Ask/Launcher 基座、当前工具目录、适用的 skill/工作区参考和 cwd；子代理说明须有当前 task 工具。
3. 意图匹配 skill、可用的开发检查指引、动作 scope。
4. Designer embed、可用的 Launcher cache、可用的标题工具指引。
5. `preparedContext.systemSuffix` 压缩摘要。
6. 当前 MCP 工具/provider 指引和 live 文档范围或不可用说明。

请求与消息准备由 `agent-harness/turn-request.server.ts` 负责；system 组合入口是
`agent-harness/turn-runtime.server.ts` → `agent-turn-runtime.ts` → `instructions.ts` /
`agent-system-prompt.ts`。HTTP route 仅接入同一 Agent handler，Next 和独立服务复用该链。

---

## 1. 静态 System 基座

| 模式 | 常量 | 源文件 | 用途 |
|------|------|--------|------|
| **Agent**（默认） | `SYSTEM_INSTRUCTIONS` | `agent-gui/lib/instructions.ts` | 通用助手：Role、Communication、Runtime、Capabilities、Skills 路由 |
| **Ask** | `ASK_SYSTEM_INSTRUCTIONS` | 同上 | 只读模式说明与当前允许的读取端口 |
| **Launcher** | `LAUNCHER_SYSTEM_INSTRUCTIONS` | 同上 | 全局快捷键轻量面：快速执行、短回复、工具子集 |

模式由请求体 `chatMode` 决定（`agent-gui/lib/chat-mode.ts`）。

### Agent 基座章节

| 章节 | 内容要点 |
|------|----------|
| Role | Quicker 桌面 + 本机环境；先匹配意图再选工具 |
| Communication | 用户语言（默认中文）；不对用户暴露工具名/CLI/JSON |
| Runtime | qkrpc serve；侧栏 cwd = shell / qkrpc / workspace 根；`<qka id="uuid">` |
| Workflow reference | 工作流和工具族仅为参考；最终工具目录、模式和实际执行端口决定本轮可用范围 |
| Skills | action authoring essentials 预加载；`skill_load` 按精确名称分页深读 |

### Launcher 基座差异

- 更短、强调「立即执行 + 一句结果」
- **Out of scope**：`workspace_program`、`qkrpc_step_runner_*`、`dev_frontend_check`、`llm_settings` 等多步编写
- 含 `ACTION_LINK_SUMMARY_PROMPT`（patch 后摘要规则）
- 默认工具由 `LAUNCHER_TOOL_IDS`（`chat-mode.ts`）给出，再与用户勾选、命令限制求交；最多 12 步

完整产品/架构说明见 [agent-gui-launcher.md](agent-gui-launcher.md)（双窗桥接、cache/resolve 直连、持久化边界）。

---

## 2. Agent Skills（[agentskills.io](https://agentskills.io/specification)）

加载器：`lib/agent-skills/`（发现 `docs/skills/*/SKILL.md`、解析 frontmatter、渐进披露）。Authoring 专题目录仍由 `lib/action-authoring-docs.ts` 提供 `docs` 工具与 topic 索引。工作区自定义 commands/skills 见 [agent-defs-spec.md](agent-defs-spec.md)。

| Tier | 内容 | 何时 | 实现 |
|------|------|------|------|
| 1 Catalog | `name` + `description` | Agent 每次 chat | `formatSkillCatalogForPrompt()` — 非预加载 skill |
| 2 Essentials | `prompt-tier0` / `prompt-tier2` 摘录（Hard rules、P4 pick） | Agent 每次 chat（默认） | `formatPreloadedSkillsEssentialsForPrompt()` |
| 2 Full | 完整 tier-2 body | `HARNESS_PRELOAD_SKILLS=1` | `formatAuthoringSkillForPrompt()` |
| 2t Turn | pattern skill 步骤骨架 | 编写意图 / `/author` / @ pin | `skill-intent-preload.ts` |
| 1.5 Search-first | `search-strategy-prompt.ts` | Agent 每次 chat | `SEARCH_STRATEGY_PROMPT` |
| 3 Deep read | skill 正文/reference | `skill_load` 精确名称 + 分页 | 运行时按需 |

### 预加载：quicker-authoring + quicker-eval-expression

| 项 | 说明 |
|----|------|
| 默认 | **Essentials** — Pattern traps、P0–P7、Hard rules、P4 pick（~60 行） |
| 全文 | `HARNESS_PRELOAD_SKILLS=1` 或 `skill_load` 分页 |
| 源 | `docs/skills/quicker-authoring/prompt-tier0.md`、`quicker-eval-expression/prompt-tier2.md` |

**设计原则**：session 开头不批量加载 Skill；目录已在 system 中，任务命中后只调用一个 `skill_load`，需要时继续 offset 或读取它列出的 reference。`docs` 保留给 Quicker 编写专题，不再兼任通用 Skill loader。

### Post-patch summary

`ACTION_LINK_SUMMARY_PROMPT`（`lib/action-link-markup.ts`）：patch 成功后简短文字总结；**不要**输出 `<qka-link>`（UI 自动展示动作卡片）。

---

## 3. 运行时 System 附加块

| 块 | 条件 | 生成函数 | 内容 |
|----|------|----------|------|
| **cwd** | 有效工作目录已解析 | `buildSystemInstructions` | `## cwd` + `qkrpc cwd: {path}` |
| **Action scope** | 消息 pin 或显式 Designer 上下文形成目标 | `formatActionScopeForSystem` | 本轮动作目标提示，不扩大工具权限 |
| **Launcher cache** | Launcher 且最终目录有 `launcher_command_cache` | `buildLauncherCommandCachePromptBlock` | 相似历史指令与步骤，供复用 |
| **Thread title** | 非 Launcher，最终目录有 `set_thread_title`，且标题条件满足 | `buildThreadTitleAgentInstruction` | 调用当前可用的标题工具；显式空集合时不加入指引 |
| **Context compression** | 接近 context 上限（~90% usage）且存在可摘要旧切片 | `prepareCompressedContext` → `systemSuffix` | token 预算内近端完整 messages + 旧轮 structured 摘要；可选 microcompact；压缩后 reinject 最近 patch 文件；provider 拒收时 reactive 重试 |

工作目录解析：`resolveEffectiveWorkingDirectory()`（侧栏设置 → 否则服务端默认：dev 为 repo 根，发布为 `Documents/QuickerAgent/workspace`）。

---

## 4. User Messages（非 system）

| 阶段 | 函数 | 作用 |
|------|------|------|
| 存储 | UI composer | 用户可见文本；动作 chip 存为 `<qkrpc-action-tag …>` |
| 送模前 | `expandUserMessageForModel` | tag / `<qka-link>` → `<qka id="uuid">Title</qka>` 行（`lib/compose-user-message.ts`） |
| 压缩 | `prepareCompressedContext` | 默认完整历史；快满时（~90% usage / 92% 估算）按 **token 预算** 保留近端、摘要远端；旧 tool 输出可先 microcompact；压缩后 reinject 最近 patch 文件片段；多步 tool 回合内 `prepareStep` 再次 microcompact；`/api/chat` 遇 context length 错误时 reactive 重试 1 次 |

Action scope 与 user tag 共用 `<qka>` 解析（`lib/action-scope.ts`）。

---

## 5. 工具描述 = Prompt 延伸

System 投影本轮最终可执行工具及其操作限制；具体参数、枚举、示例来自当前 SDK 定义的
`description` / `inputSchema`。静态工具族和工作流文档不增加当前权限。

动作/子程序 get、workspace 与动作 open 的 `operationPolicy.operationFacts` 描述当前端口
可能的宿主修改、本地持久写、bootstrap、导出/修补和后台诊断。`approval` 只观察当前
`needsApproval` 定义，动态回调标为 runtime，不提前调用。未知端口保持 unknown；这些事实
既不授权也不证明操作发生。`TurnPlan.proposedOperation` 使用同一输入相关定义，避免将
可能写入的兼容读取恢复步骤当纯读。完整边界见[Agent 架构](agent-architecture.md)。

| 类别 | 代表模块 |
|------|----------|
| 编写指南 | `docs-tool.server.ts` — get/search/index/reference |
| 工作区程序 | `workspace-program-tool.ts` + `workspace-program-tool.server.ts` |
| 动作 / 子程序 | `qkrpc-action-tool.server.ts`, `qkrpc-subprogram-tool.server.ts` |
| Step runner | `step-runner-tool.server.ts`（Agent only；禁止 get-ui） |
| 本地 | `shell-tool.ts`, `browser-tool.server.ts` |
| Launcher | `launcher-resolve-tool`, `launcher-command-cache-tool` |

UI 原始工具勾选 → HTTP `enabledTools` → 服务端模式交集 → 内部/MCP/live 组合与最终命令限制。
Ask 和 Launcher 同样遵守显式勾选；缺省使用各模式默认值，原始 `[]` 禁用本轮所有来源，
包括启动器 direct 快捷路径。MCP-only 命令的内置交集为空不等于用户选择 `[]`。
完整合同见[Agent 架构](agent-architecture.md)。

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
| L3 Reference | `authoring-references/` | `docs search` → snippet |

CLI 消费者：`qkrpc guide get` 读 `docs/action-authoring/cli/`（同 manifest 另一 profile）。

---

## 7. 特殊模式

| 模式 | 触发 | System 差异 |
|------|------|-------------|
| **title-test** | `/tool-test` `titleTestOnly` | 当前允许标题工具时加入 `buildTitleTestChatInstruction`；不绕过显式空集合 |
| **contextCompressionForce** | tool-test dev | 强制压缩（非 production） |
| **Launcher direct** | cache/resolve 命中 | 可能短路 stream，不经过完整 system 栈 |

---

## 8. 源文件索引

| 路径 | 职责 |
|------|------|
| `agent-gui/lib/instructions.ts` | System 基座 + `buildSystemInstructions` |
| `agent-gui/app/api/chat/route.ts` | HTTP 入口，委托公共 Agent handler |
| `agent-gui/lib/agent-harness/turn-runtime.server.ts` | 最终工具、唯一计划、压缩上下文与 system 组合 |
| `agent-gui/lib/agent-turn-runtime.ts` | 条件化 system builder |
| `agent-gui/lib/tool-catalog-system-prompt.ts` | 当前定义、模式/操作事实与审批描述 |
| `agent-gui/lib/program-tool-operation-facts.ts` | 已建模程序端口的可能副作用；不授予权限 |
| `agent-gui/lib/action-authoring-docs.ts` | tier0 + topic index 注入 |
| `agent-gui/lib/action-scope.ts` | 动作上下文 system 块 |
| `agent-gui/lib/context-compression.ts` | 长对话摘要 suffix |
| `agent-gui/lib/set-thread-title-tool.ts` | 首条对话标题指令 |
| `agent-gui/lib/launcher/launcher-command-cache.server.ts` | Launcher 缓存 prompt 块 |
| `agent-gui/lib/compose-user-message.ts` | User 消息 tag 展开 |
| `agent-gui/lib/action-link-markup.ts` | Patch 后摘要 prompt 常量 |
| `agent-gui/lib/chat-mode.ts` | Agent / Launcher 工具与步数上限 |
| `docs/agent-gui-launcher.md` | 启动器产品设计、执行链路、源文件索引 |
| `docs/action-authoring-src/README.md` | Authoring 模板与 marker 语法 |

---

## 9. 维护提示

- 改 **通用行为**（语言、capabilities、runtime）→ `instructions.ts`
- 改 **编写路由 / P0–P7 / hard rules** → `prompt-tier0.src.md` → `docs:gen`
- 改 **topic 列表或分层** → `manifest/topics.json` → `docs:gen`
- 改 **工具参数** → 对应 `*-tool*.ts` 的 description/schema（system 仅保留一行指向）
- 新增 topic 流程见 `docs/action-authoring-src/README.md` § Add a topic
