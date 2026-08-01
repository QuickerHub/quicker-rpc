# 产品能力与规划

> 本文是产品状态的唯一权威文档。状态来自当前代码、feature flag 和测试；历史设计稿不作为完成依据。

```text
QuickerAgent (Electron + Next.js + AI SDK)
  -> qkrpc CLI / MCP / HTTP
  -> QuickerRpc Runtime + Transport
  -> Plugin.V1/net472 或 Plugin.V2/net10
  -> Quicker
```

状态含义：**已实现** = 有入口、代码和基本验证；**实验性** = 有代码但未进入正式承诺；**对齐中** = 仍有 stub/capability 缺口；**已禁用** = 代码保留但产品入口关闭。

## 当前能力总表

| ID | 用户能力 | 状态 | 事实入口 |
|---|---|---|---|
| CHAT | Agent/Ask/Launcher、流式工具、审批、多线程历史、上下文压缩 | 已实现 | `agent-gui/lib/agent-harness/`、`agent-core/`、`lib/db/` |
| AUTHOR | 动作/子程序搜索、同步、编辑、diagnostics、patch、run/trace | 已实现，持续补齐高级编辑 | `action-editor/`、`workspace-program-*`、QuickerRpc Runtime |
| LAUNCH | 全局快捷键、临时会话、command cache/resolve direct | 已实现 | `lib/launcher/`、`electron/commands/launcher.mjs` |
| WORK | 文件、Grep、Shell、终端、后台/用户浏览器、网络搜索、浏览器转动作 | 已实现 | `workspace-*-tool*`、`shell-*`、`browser-*` |
| EXT | 模型配置、Commands、Skills、Agents、`task` 子代理 | 已实现 | `llm-*`、`agent-defs/`、`agent-skills/`、`task-tool.server.ts` |
| VOICE | 本地 ASR 输入插件 | 已实现，可选安装 | `voice-input/`、`voice-asr-runtime/` |
| VOICE-CHAT | `/voice-chat` 全双工语音页 | 实验性 | `components/voice-chat/`、`lib/voice-chat/` |
| CLIPBOARD | 剪贴板历史 | 已禁用 | `CLIPBOARD_HISTORY_ENABLED = false` |
| RPC-V1 | qkrpc CLI/MCP/HTTP + net472 插件 | 已实现 | Console/Contracts/Runtime/Transport/Plugin.V1 |
| RPC-V2 | net10 插件覆盖 net472 能力 | 对齐中 | Plugin.V2 仍有 stub 和关闭 capability |

Coding Agent 修改前按 [任务路由](../agents/README.md) 进入代码。

<a id="p-chat"></a>
## CHAT：对话与上下文

主流程固定为：请求解析 → 模型/目标 → 每 turn 唯一 `TurnPlan` → AI SDK `ToolLoopAgent` → UI stream → SQLite。

- Agent 可写和运行；Ask 只读；Launcher 使用受限工具面和短会话。
- 完整历史存入 `%APPDATA%/QuickerAgent/agent.db`；压缩只改变模型视图。
- Launcher 临时会话不进入常规历史。
- 主对话不得增加第二套通用 agent loop。

验证：`test:tools`、`test:agent-eval`、`test:context-compression`。存储细节见 [对话存储](../agent-gui-chat-storage.md)，架构见 [Agent 架构](../agent-architecture.md)。

<a id="p-author"></a>
## AUTHOR：动作与子程序编写

权威流程：search/get → 同步 `.quicker` → `workspace_program` 编辑 → diagnostics → patch → run/trace；publish 只在用户明确要求时执行。

- step 参数先查询 step-runner schema，不猜 `inputs`。
- 普通文件工具不得直接编辑 `.quicker` 程序体。
- Designer 打开时尊重内存态和保存保护。
- 全局子程序发布使用 subprogram 命令，不走 action update。

验证：`test:step-editor`、`test:tools`、`test:context-compression`。知识源见 [动作编写管线](../authoring/README.md)。

<a id="p-launch"></a>
## LAUNCH：全局启动器

默认快捷键为 `CommandOrControl+Shift+Space`。缓存/resolve 只在确定性、高置信时直连；失败回退统一 Agent 流程。

- Launcher 工具面只由 `LAUNCHER_TOOL_IDS` 定义。
- 一次仅一个活动 run，关闭时清理审批与临时会话。
- `/voice-chat` 的 TTS 不等于 Launcher 已支持结果播报。

验证：`test:launcher`、Agent eval 的 Launcher cases、Electron 开发态唤起/隐藏检查。技术契约见 [Launcher](../agent-gui-launcher.md)。

<a id="p-work"></a>
## WORK：工作区与自动化

- `Read/Grep/Write/StrReplace` 处理普通文件，`workspace_program` 处理 Quicker 程序体。
- Shell/终端共用审批和安全策略，UI 终端不能绕过 policy。
- 后台浏览器不继承用户登录态；用户浏览器通过 Quicker Connector。
- 浏览器转动作只生成草稿，写入仍走 `workspace_program`。

验证：领域单测、`test:tools`、影响 UI 时执行 frontend check。浏览器边界见 [browser-automation.md](../browser-automation.md)。

<a id="p-ext"></a>
## EXT：模型、Agent 资产与本地插件

- 模型 profile、选择和密钥存入用户数据，不能进入 Git 或安装资源。
- `.quicker/commands`、`skills`、`agents` 由统一 discovery 加载。
- `task` 子代理使用允许工具列表且不递归暴露自身。
- plugin catalog 的 `availability` 是产品入口事实源。

语音输入可用；全双工语音页仍实验性；剪贴板历史保持禁用。验证使用 LLM、agent-defs/skills/task、voice-input/voice-chat 对应测试。资源边界见 [用户数据与插件](../agent-gui-plugin-storage.md)。

<a id="p-rpc"></a>
## RPC：外部 Agent 与 Quicker 宿主

CLI、MCP 和 HTTP 共用 Contracts/Runtime/Transport，Quicker 版本差异只应存在于 host adapter。

- V1/net472 是当前完整宿主。
- V2/net10 已实现多项核心 adapter，但 ActionSharing/Expressions/部分布局操作仍有 stub，ChromeControl/Triggers/Designer capability 当前关闭。
- capability 必须反映真实实现；能编译不等于能力对齐。

V2 完成门槛和矩阵见 [Plugin.V2 对齐计划](../design/quicker-rpc-plugin-v2.md)。外部接入见 [MCP/CLI 集成](../agent-mcp-integration.md)。

## 当前规划缺口

| 优先级 | 缺口 | 完成条件 |
|---|---|---|
| P0 | net10 未完全覆盖 net472 | V1 能力逐项等价或明确不支持；capability、离线测试和活进程 smoke 一致 |
| P1 | Launcher 语音自动提交/结果短播报 | 可关闭、可打断、有失败降级和测试 |
| P1 | 全双工语音仍是独立实验页 | 明确是否进入主产品，并统一会话、模型、权限和退出行为 |
| P2 | 剪贴板历史禁用 | runtime 稳定、升级与资源释放回归通过后再开放 |

新增规划项必须包含用户问题、入口、负责功能域、代码锚点和验收方式；只有想法或实施步骤的内容进入 Issue，不再新增平行 roadmap。
