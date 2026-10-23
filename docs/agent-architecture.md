# QuickerAgent 架构规范

> 状态：当前权威架构文档。代码行为以测试和实现为准；本文定义模块边界与依赖方向。

QuickerAgent 使用 TypeScript、Next.js 和 Vercel AI SDK。AI SDK
`ToolLoopAgent` 是模型与工具循环的唯一框架内核；项目代码只实现 Quicker 特有的请求解析、
策略、上下文管理、工具适配和 UI 协议。

## 1. 分层

```text
UI / HTTP adapters
  → Agent application（一次 turn 的编排）
    → Agent domain（计划、权限、恢复、验证策略）
      → Ports（模型、工具、存储、宿主能力）
        → Adapters（AI SDK、qkrpc、文件、浏览器、Shell）
```

| 层 | 当前入口 | 只负责 |
|----|----------|--------|
| HTTP | `app/api/chat/route.ts` | 请求解码、release preview、调用应用层 |
| Application | `lib/agent-harness/run-turn.server.ts` | 串联 turn 阶段、把错误转换为响应 |
| Request | `lib/agent-harness/turn-request.server.ts` | 模式、slash、消息修复、LLM selection 标准化 |
| Runtime preparation | `lib/agent-harness/turn-runtime.server.ts` | scope、tools/Skills/MCP、TurnPlan、调用策略、prompt、context budget |
| Agent loop | `lib/agent-harness/stream-loop.server.ts` | `ToolLoopAgent`、step hook、stream metadata、压缩重试 |
| Domain | `lib/agent-core/`、`agent-recovery-policy.ts` | 无 IO 的决策与值对象 |
| Tool adapters | `lib/tools.ts` 及各 `*-tool.server.ts` | 调用外部能力并返回统一结果 |

## 2. 依赖规则

1. Route 不包含模型、工具和 prompt 策略。
2. Domain 不依赖 Next.js、React、数据库、qkrpc 或进程环境。
3. Application 可以依赖 Domain 和 port 类型，不直接拼装具体工具参数。
4. Adapter 可以依赖外部 SDK；外部 SDK 类型不得扩散到 Domain。
5. UI 只消费 API/UI-message 契约，不导入 server-only 模块。
6. 同一业务决策每个 turn 只计算一次，并通过显式对象向下传递。
7. 新增行为进入最窄的所属层，禁止继续向 `runAgentChatTurn` 堆条件分支。

当前 `AsyncLocalStorage` 是旧工具的兼容层。新代码优先显式接收
`AgentTurnContext`/`ToolExecutionContext`；只有 adapter 边界可以读取 ALS。

### 工作台组合边界

工作台的产品意图见 [`agent-gui/DESIGN.md`](../agent-gui/DESIGN.md)。展示层按以下入口组合已有能力：

| 入口 | 职责 |
|---|---|
| `components/shell/AgentWorkbenchShell.tsx` | `AgentWorkbenchShell` 组合侧栏与主区域；`AgentConversationFrame` 组合 header、messages、approval、composer 与 dock |
| `components/chat/Chat.tsx` | 持有现有会话与面板状态，向框架传入内容、回调与 DOM refs |
| `lib/agent-workbench-features.ts` | 声明快捷入口的稳定 id、文案、panel/command/route 目标及可用条件 |
| `components/chat/ComposerShortcutCards.tsx` | 将功能定义绑定到已有图标、面板 hook、命令和路由 |
| `app/theme.css`、`app/agent-workbench.css` | 主题根节点统一黑白灰通用 token（包含 body portal）；`.agent-workbench` 限定主工作台布局尺寸 |

框架组件为纯展示组合，不启动 Agent、不持久化会话、不注册模型工具。保留现有分栏 DOM 与 refs，拖动、消息滚动和面板状态继续由原有组件负责。功能定义是界面入口目录；运行时工具目录与策略仍由 `TurnPlan` 和工具层负责。

DSH 参考固定为 [DeepSeek Harness `687f282`](https://github.com/deepseek-ai/deepseek-harness/tree/687f282e8625c6b8d11ff58211a90524be2e4317)：

- [布局槽位](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-layout/src/client/index.ts) 将框架几何与业务区域分开。
- [面板定义](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-sidebar-right/src/client/tab-registry.ts) 将静态身份、渲染器与实例状态分开。

本项目采用这些组合边界，以 React props 和静态类型定义实现；没有引入 Cordis、DSH loop、DSH Session 格式或动态插件加载。后续功能先接入已有业务服务，在需要展示的位置增加组件与入口；不要为布局扩展复制工具注册表、事件流或会话状态源。

## 3. Turn 生命周期

一次聊天 turn 固定经过以下阶段：

1. `resolve request`：修复中断消息、解析模式/slash、解析模型选择。
2. `direct route`：Launcher 可命中无需模型的确定性快捷路径。
3. `resolve model`：检查配置并创建 AI SDK `LanguageModel`。
4. `resolve scope`：合并消息引用和 Action Designer 默认目标。
5. `prepare runtime`：生成唯一 `TurnPlan`，加载内置工具与已启用 MCP，应用调用策略，生成 system 和上下文预算。
6. `run agent`：`ToolLoopAgent` 执行多步模型/工具循环。
7. `present`：转换为 AI SDK UI message stream，记录 usage 与运行时元数据；流结束后释放 MCP transport。

任何绕过这些阶段的快捷路径必须是确定性的，并在名称中带 `direct`。

## 4. AI SDK 与项目代码边界

`ToolLoopAgent` 负责：

- 调用模型；
- 解析和执行工具调用；
- 多 step 循环；
- `prepareStep`、`stopWhen`、tool-call repair；
- 生成标准 stream result。

QuickerAgent 负责：

- `TurnPlan`、风险与权限；
- 工具发现、schema 瘦身和产品模式；
- 上下文压缩、旧工具输出 microcompact、provider 拒收后的单次重试；
- qkrpc/文件/浏览器等 adapter；
- UI metadata、持久化和评测。

不得再实现第二套通用 agent loop，也不得仅为“框架化”引入 LangChain、Mastra 等
与 AI SDK 重叠的编排层。当前需要的 Skills、MCP、审批和多 step 已能在 AI SDK 边界内实现；
只有出现现有内核无法表达、且有基准证明收益的产品需求时才重新评估框架迁移。

## 5. 核心契约

| 契约 | 含义 | 生命周期 |
|------|------|----------|
| `ChatPostBody` | HTTP 输入 DTO | route 内 |
| `ResolvedAgentTurnRequest` | 标准化请求 | 整个 turn |
| `TurnPlan` | intent、risk、target、tools、verification 的权威决策 | 每 turn 一份 |
| `ToolExecutionContext` | cwd、scope、thread、bench 等执行上下文 | 每 turn 一份 |
| `PreparedAgentTurnRuntime` | 交给 Agent loop 的完整运行参数 | stream 前生成 |
| `AgentRuntimeSnapshot` | 供 UI/评测观察的只读快照 | 输出 metadata |

DTO、Domain 值对象和外部 SDK 类型必须分开命名。禁止用可选字段不断扩张一个“万能
context”。

## 6. 工具规范

每个工具能力逻辑上分为五部分：

1. `catalog`：稳定 id、用途、风险和 capability bundle；
2. `selection`：由 `TurnPlan` 决定本 turn 是否暴露；
3. `model schema`：给模型的 description/input schema，可按需瘦身；
4. `execute`：只执行能力，通过显式 context 访问宿主；
5. `presentation`：把原始结果转换为 model view 和 UI view。

执行函数不得同时承担工具选择或 UI 渲染。工具失败应返回结构化错误和可执行的
`nextAction`；仅真正的基础设施异常才抛出异常。

对应实现：

| 策略 | 权威入口 | 不变量 |
|---|---|---|
| 静态目录 | `tool-registry.ts` + `agent-tool-catalog.ts` | id 唯一；目录与可执行定义一一对应；description/schema 非空 |
| 每 turn 调用限制 | `agent-tool-policy.ts` | 默认限制总次数和相同输入次数；等待、删除、task、MCP 可覆盖 |
| 模型输出 | `tool-result-model-messages.ts` | 去除 `displayData`；超过 8KB 固定保留 head 6KB + tail 1KB |
| UI 输出 | 原始 tool result / `displayData` | 不受模型视图裁剪影响 |
| Schema 暴露 | `agent-harness/model-tool-definitions.ts` | 核心/当前 bundle/MCP 保留完整 schema，其余提供发现提示 |

工具以用户意图、权限和副作用为边界。不要只为减少 tool 数量合并不同风险或不同
工作流阶段；模型可见 schema 保持 provider 兼容的扁平对象。需要降低 prompt 成本时，
优先使用 `TurnPlan` 选择相关工具子集、瘦身 schema 和压缩工具结果，不牺牲稳定 tool id。

## 7. 上下文与流

- SQLite/线程存储保留完整历史；压缩只改变送给模型的视图。
- 压缩顺序固定为：旧输出 microcompact → 结构化摘要 → 最近 patch reinject。
- provider context-length 错误只允许在尚未输出可见内容时强制压缩重试一次。
- usage、压缩原因、turn state 和 recovery decision 只作为 metadata，不反馈污染模型历史。

Prompt 的块结构见 [agent-gui-prompt-structure.md](agent-gui-prompt-structure.md)。

## 8. Skills 与 MCP 扩展

Skills 遵循 catalog → `skill_load` 分页正文 → 精确 reference 文件的渐进披露流程。发现优先级为
workspace `.quicker/skills` → user `agent-defs/skills` → bundled `docs/skills`。Skill 正文不再借用
`docs` 或猜测磁盘路径加载。

Agent 作为 MCP client 时使用同一优先级读取配置：

- user：`%APPDATA%/QuickerAgent/agent-defs/mcp.json`
- workspace：`<cwd>/.quicker/mcp.json`（同名 server 覆盖 user）

```json
{
  "mcpServers": {
    "example": {
      "enabled": true,
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@example/mcp-server"],
      "tools": ["search", "get"],
      "requireApproval": true,
      "maxCallsPerTurn": 6
    },
    "remote": {
      "enabled": true,
      "transport": "http",
      "url": "https://example.test/mcp",
      "headers": { "Authorization": "Bearer ${EXAMPLE_MCP_TOKEN}" }
    }
  }
}
```

规则：server 必须显式 `enabled: true`；远程工具名暴露为 `mcp__<server>__<tool>`；stdio 不经过
shell；密钥只允许通过 `${ENV_NAME}` 展开；可写/外部工具建议设置 `requireApproval` 和 `tools`
allowlist。Launcher、title test 与 benchmark 不加载 MCP。实现位于 `lib/agent-mcp/`，客户端依赖锁定
到与 AI SDK 6 同代的 `@ai-sdk/mcp`，不引入第二套 Agent 框架。

## 9. 验证门槛

Agent 核心改动至少执行：

```powershell
cd agent-gui
pnpm exec tsc --noEmit
pnpm test:agent-eval
pnpm test:context-compression
```

影响 Next/API/UI 时还必须在 dev server 上运行 `dev_frontend_check`，直到 `ok: true`。
涉及工具选择时增加 `chat-tool-selection`/`turn-plan` 契约测试；涉及 Agent loop 时使用
mock model 覆盖多 step、tool error 和 stop condition。

## 10. 文档治理

- 本文是 Agent 架构唯一权威入口。
- 长期行为写规范或运行手册；实现进度写 issue/PR，不在仓库保留日期命名的计划快照。
- 已完成方案由代码、测试和 Git 历史承载，不保留重复的 spec + plan。
- 文档不得引用已删除的历史计划；临时调查结论在合并前迁入权威文档或删除。
- Agent harness 的文件级导航见
  [`agent-gui/lib/agent-harness/README.md`](../agent-gui/lib/agent-harness/README.md)。

## 11. 相关文档

- [agent-gui-prompt-structure.md](agent-gui-prompt-structure.md)：prompt 与 skill 拼装。
- [agent-gui-eval.md](agent-gui-eval.md)：生产路径评测。
- [agent-authoring-benchmark.md](agent-authoring-benchmark.md)：动作编写 benchmark。
- [browser-automation.md](browser-automation.md)：浏览器 adapter 边界。
