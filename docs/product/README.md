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
| WORKBENCH | V2 风格基础工作台、深浅主题、可组合会话布局、声明式快捷入口 | 基础壳已实现，Agent 与工作台持续重构中 | `components/shell/AgentWorkbenchShell.tsx`、`app/agent-workbench.css`、`lib/agent-workbench-features.ts` |
| AUTHOR | V1 动作 YAML open/save；动作/子程序搜索、旧 workspace 编辑、diagnostics、run/trace | 已实现，YAML 首期覆盖现有 V1 动作程序体 | Console/MCP source-bundle、AgentModel codec、`action-editor/`、Runtime |
| LAUNCH | 全局快捷键、临时会话、command cache/resolve direct | 已实现 | `lib/launcher/`、`electron/commands/launcher.mjs` |
| WORK | 文件、Grep、Shell、终端、后台/用户浏览器、网络搜索、浏览器转动作 | 已实现 | `workspace-*-tool*`、`shell-*`、`browser-*` |
| EXT | 模型配置、Commands、Skills、Agents、`task` 子代理、外部 MCP 工具 | 已实现（MCP 配置入口实验性） | `llm-*`、`agent-defs/`、`agent-skills/`、`agent-mcp/`、`task-tool.server.ts` |
| RPC-V1 | qkrpc CLI/MCP/HTTP + net472 插件 | 已实现 | Console/Contracts/Runtime/Transport/Plugin.V1 |
| RPC-V2 | net10 插件覆盖 net472 能力 | 对齐中 | Plugin.V2 仍有 stub 和关闭 capability |

语音输入、语音聊天与剪贴板历史已移除，相关页面、插件安装与运行时不再属于产品能力。

Coding Agent 修改前按 [任务路由](../agents/README.md) 进入代码。

<a id="p-workbench"></a>
## WORKBENCH：主 Agent 工作台

主界面沿用 Quicker V2 Agent 工作台的紧凑布局，主界面与菜单、浮层、设置共用黑白灰深浅主题。会话与输入区共享内容轨道，新会话居中；已有侧栏、工具消息、审批与 dock 由展示框架组合。

设置、资源、浏览器、小窗、工具测试和发布预览通过统一的快捷入口定义连接现有功能，保留开发/调试可用条件。功能定义不改变工具权限或后端 capability。当前未增加专用 YAML 编辑面板或动态 UI 插件加载能力。

体验约定见 [工作台设计](../../agent-gui/DESIGN.md)，工程边界见 [Agent 架构](../agent-architecture.md#工作台组合边界)。验证使用开发态 frontend check，并检查深浅主题、新/已有会话、审批与侧面板。

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

现有 V1 动作通过 CLI/MCP 或 QuickerAgent 的默认流程：search → `action open` → 编辑
`program.source.yaml` / `files/` → `action save --dry-run` → `action save` → 按需 run/trace。
YAML codec 对接规范 wire；原生基线、版本检查和 Designer 保护共同约束写回。
dry-run 完全离线，成功保存更新基线而不重写用户源。V2 原生 source adapter 已有 catalog/draft
与保真条件写入及离线验证；按实际宿主 API/dispatcher 探测 capability，目标绑定与活进程
验收完成前，日常 V2 动作仍使用 Quicker 原生 MCP。

QuickerAgent 提供 `qkrpc_action_open/save`；目录绑定 sidebar cwd，现有文件工具编辑
YAML 与资源；`dryRun` 必须显式指定，先 `true` 再 `false`。open 写磁盘，两者均属
Agent 写入能力，Ask/Launcher 不开放。保存只尝试一次，冲突、Designer 保护和
`persisted=true` 但 checkpoint 失败分别反馈，不隐藏部分落盘结果或自动重试。

`workspace_program` 继续服务兼容 JSON；创建、元数据、全局子程序保留原流程：
search/get → 同步 `.quicker` → 编辑 → diagnostics → patch → run/trace。
publish 只在用户明确要求时执行。

- step 参数先查询 step-runner schema，不猜 `inputs`。
- source bundle 用宿主文件工具编辑 YAML/资源；工具管理的 sidecar/原生基线不得手改。
- QuickerAgent 的旧 `.quicker` JSON 程序体仍使用 `workspace_program`。
- Designer 打开时尊重内存态和保存保护。
- 全局子程序发布使用 subprogram 命令，不走 action update。

验证：`qkrpc-action-source-tool.test.ts`、`qkrpc-tool-call.test.ts`（fake transport），以及 `test:step-editor`、`test:tools`。知识源见 [动作编写管线](../authoring/README.md)。

<a id="p-launch"></a>
## LAUNCH：全局启动器

默认快捷键为 `CommandOrControl+Shift+Space`。缓存/resolve 只在确定性、高置信时直连；失败回退统一 Agent 流程。

- Launcher 工具面只由 `LAUNCHER_TOOL_IDS` 定义。
- 一次仅一个活动 run，关闭时清理审批与临时会话。

验证：`test:launcher`、Agent eval 的 Launcher cases、Electron 开发态唤起/隐藏检查。技术契约见 [Launcher](../agent-gui-launcher.md)。

<a id="p-work"></a>
## WORK：工作区与自动化

- `Read/Grep/Write/StrReplace` 处理普通文件和 V1 source bundle 的 YAML/资源；`workspace_program` 处理兼容 `.quicker` JSON 程序体。
- Write/StrReplace 在读取写前快照前检查实际目标仍在 cwd 内，拒绝工具管理的 source sidecar/baseline、NTFS alternate streams 和多硬链接文件；普通独立文件继续使用原编辑流程。
- Shell/终端共用审批和安全策略，UI 终端不能绕过 policy。
- 后台浏览器不继承用户登录态；用户浏览器通过 Quicker Connector。
- `browser` 的 SDK/turn 取消已贯通探测、等待、HTTP 与两个 runtime 的 request owner；取消不回退、不录制迟到结果，也不关闭共享 session。每次原生等待及共享状态提交前核验 owner，队列等待 native promise 结束，已发副作用不可撤销，边界见 [浏览器自动化](../browser-automation.md#取消边界)。
- 浏览器转动作只生成草稿，写入仍走 `workspace_program`。
- 临时工作区清理只删除本地目录，保留所有 Quicker 宿主内容；文件里的程序 ID 不作为自动删除依据。管理目录及其祖先重定向到其他路径时拒绝创建与清理。

验证：领域单测、`test:tools`、影响 UI 时执行 frontend check。浏览器边界见 [browser-automation.md](../browser-automation.md)。

<a id="p-ext"></a>
## EXT：模型与 Agent 资产

- 模型 profile、选择和密钥存入用户数据，不能进入 Git 或安装资源。
- `.quicker/commands`、`skills`、`agents` 由统一 discovery 加载。
- Skill 通过 `skill_load` 按名称和 offset 渐进加载；不把全部正文塞入初始 prompt。
- `task` 子代理使用允许工具列表且不递归暴露自身。
- 外部 MCP 从 user/workspace `mcp.json` 加载，server 必须显式 enabled；工具 namespaced、可 allowlist/审批/限流，并在 turn 结束关闭连接。配置入口暂按实验性管理。

验证使用 LLM、agent-defs/skills/task 和外部 MCP 对应测试。资源边界见 [用户数据与安装资源](../agent-gui-plugin-storage.md)。

<a id="p-rpc"></a>
## RPC：外部 Agent 与 Quicker 宿主

CLI、MCP 和 HTTP 共用 Contracts/Runtime/Transport，Quicker 版本差异只应存在于 host adapter。

- V1/net472 是当前完整宿主。
- 现有 V1 动作源码编辑提供 CLI `action open/save`、MCP `qkrpc_action_open/save` 与 HTTP `action.open/save`；范围限 V1 动作程序体。
- V2/net10 已接共享表达式服务及多项核心 adapter；ActionSharing/部分布局操作仍有 stub，ChromeControl/Triggers/Designer capability 当前关闭。
- RPC/CLI health 已返回宿主类型、版本、本次加载 session 与动作能力；专属 endpoint、候选选择、不可变写入绑定和 V2 native source/codec 已有离线实现及集成回归。V1 已热更核验，绑定后的双宿主动作写回、V2 加载与重启仍待验收。
- capability 必须反映真实实现；能编译不等于能力对齐。

V2 完成门槛和矩阵见 [Plugin.V2 对齐计划](../design/quicker-rpc-plugin-v2.md)。外部接入见 [MCP/CLI 集成](../agent-mcp-integration.md)。

## 当前规划缺口

### Agent 与工作台持续重构

本表是用户要求的长期重构计划，随实现和验收更新；不另建平行 roadmap。
基础壳、配色和几个布局槽位只算已有基础，不代表 Agent 设计或 V2 体验迁移完成。

用户进一步指出架构混乱并质疑 Next.js 用途后，主线优先级调整为先重划服务与 UI 边界。
目标为静态 React renderer、独立 Node Agent service 与薄 Electron 壳，Next 作为当前兼容宿主逐步退出；
Vite 是 renderer 候选，需竖切片和桌面打包验收后切换。已完成的工具、YAML codec、AI SDK loop、
权限/取消修复继续保留。CI 已拆为独立对话与隔离分支推进。

在已有服务边界和 R0/R4 修复基础上，优先推进下文统一 RPC 与动作设计器主线；所需 API
按可运行的编辑链分组迁移，静态 renderer 和桌面打包最终收口。R5 通用面板抽象与更广 UI
拆分等待真实设计器需求。具体证据、模块归属和切换门槛见
[架构目标](../agent-architecture.md#框架去耦与目标运行边界)。不能把候选方案或单个去耦文件标成迁移完成。

独立 Node chat service 已有实验性源码入口（`agent-gui/service/main.ts`）：健康检查懒加载、
标准 HTTP/SSE、原 runner/SDK loop、审批往返与取消/停止回归已接通；当前主壳仍运行 Next。
生产依赖图检查拒绝 Next，browser/terminal 的服务关闭只回收本进程真实登记的子进程。
显式数据根与新版 Next/Node 的单 writer 约束已实现，隔离 CLI/真实子进程验证通过；
现有 72 个 API 路径已接入 Node，静态 React 可从搬移后的独立目录运行；同一 SDK loop 的
SSE/审批、历史/设置/workspace/Designer/docs/skills、真实 browser/terminal 启停和隔离 Edge
前端检查已有回归。Electron 静态资源、原生模块、NSIS 生成与 Windows Job 隔离 packaged
launch smoke 已验证；NSIS 安装/升级、真实旧资料与 P1–P3 的完整编辑闭环仍待集成。
默认开发/兼容打包与 Next 依赖因此保留。见 [运行清单](../engineering/static-agent-runtime.md)。

#### 统一 RPC 与动作设计器：当前主线

用户已明确新的产品目标：同一 RPC 自动识别 Quicker V1/V2，Agent 与动作设计器共用
动作服务；**下一项用户可见交付优先搬入 Quicker 项目的新动作设计器**，之后才研究高效通信。
所需服务 API 随设计器竖切片迁移。以下是近期交付顺序；R0–R8 继续作为质量与遗留缺口清单。

| 顺序 | 交付与边界 | 负责入口 | 验收门槛 / 当前状态 |
|---|---|---|---|
| A0：宿主与编辑契约 | 暴露宿主身份、会话、协议/schema 版本与逐能力声明；绑定动作存储身份和 revision | Contracts、Transport、Host.Abstractions、V1/V2 adapters；[统一动作边界](../agent-architecture.md#统一宿主与动作编辑边界) | wire 握手、专属 endpoint、选择、source/Agent 写前绑定与断线禁重发已有离线集成。source bundle 保留 HostBinding 与 V2 StorageIdentity，旧插件只读；V1 source 连续写回及 legacy JSON 持久绑定在本机 0.14.8.159 验收。主动作目标显示、本地完整记录 CAS 和 CLI/HTTP lease 内再次核验已实现；catalog 请求及文档缓存已绑定完整目标；多宿主选择、原生 V2 文档与双宿主活进程仍待验收 |
| A1：搬入新版设计器（首要界面交付） | 复用 Quicker 新 Designer 的 React 组件、结构化动作模型、catalog/session/workspace bridge 语义，先接 fixture，再接统一 RPC；保留黑白灰深浅主题 | `agent-gui/lib/action-editor/`、现有设计器 UI；Quicker `Quicker.Headless` Designer/Web 源 | 按来源清单迁移步骤/参数、变量、catalog 资源、嵌套结构、选择/撤销/重做、脏状态与保存；保留 qkrpc 外置脚本/默认值文件，连续多次编辑后的保存须与可见文档一致，完整 roundtrip 保留未知字段。已迁入多 surface/live snapshot、模块目录与标题/说明/图标，共用文档 revision、保存票据及本地两文件 CAS；真实 DOM 回归通过。资源目录、完整属性/子程序操作与 host session 接线仍待迁移 |
| A2：V1/V2 真实动作读写 | 同一动作端口调用不同宿主 adapter，补 V2 native source/codec 与必要 Designer 能力；优先动作编辑链，不等待所有 publish/Chrome 等能力对齐 | Runtime、Plugin.V1/V2、source bundle/codec；[V2 对齐计划](../design/quicker-rpc-plugin-v2.md) | V1 专用动作已验证绑定源目录连续保存、变量/外置文件/步骤绑定重读、错误目标与旧版本拒绝，以及宿主已保存但 checkpoint 失败后的新目录恢复，未重发写入。V2 adapter/保真条件存储、真实 DTO 与 fake 仓储 roundtrip/冲突/取消/部分保存已验证；V2 活进程、Designer、进程重启与完整打包流程仍待集成验收 |
| A3：统一 Agent 与编辑会话 | Agent 工具、设计器操作共享目标身份、编辑会话、权限、校验和保存结果；保留 AI SDK 单一执行循环 | Agent application/tools、Designer host bridge、动作服务 | 主动作 session 已附加实际持久绑定，完整身份进入保存票据；普通 Save 在本地 owner/lease 内 CAS，Sync 传精确目录与预期记录并保留部分成功。晚回执按 owner generation 隔离，未绑定可本地保存但不 Sync。Agent 工具仍未接 UI 的实时文档 revision；catalog 请求/缓存已绑定文档；多宿主选择、命令绑定和完整人工/Agent 交错编辑仍待实施 |
| A4：收口运行架构 | Designer 和 Agent 使用同一 React renderer、独立 Node service 与薄 Electron 壳；迁移所需 history/settings/workspace API 后移除 Next 宿主 | `agent-service/`、renderer 与 Electron 组合入口 | 会话/审批/设计器、用户数据、原生模块与资源、退出/升级验收通过后删除 Next 分支。72 API、静态 React/Node、资源/native/真实子进程与隔离 Electron 打包启动已验证；安装/升级及 P1–P3 完整流程待集成，Next 兼容入口保留 |
| A5：实测后优化通信 | 先测大动作、步骤 catalog、资源与连续编辑；复用现有 typed/protobuf 契约和 catalog snapshot/etag，再比较增量、批量、缓存与传输编码 | Designer bridge、RPC Transport、性能 fixture | 记录载荷字节、序列化/解析开销、延迟分位、内存和取消/重连行为；新方案须有基线收益且保持 revision/错误语义。不预先指定 WebSocket 或二进制重写；待 A1–A3 跑通后实施 |

首个实现切片是 A0 的最小身份/能力契约与 A1 的可运行设计器迁移并行推进；真实宿主写入
必须先满足 A0 的目标绑定。V1/V2 共用 Contracts/Runtime，版本差异留在 adapter；不复制
Agent、工具表、历史存储或设计器业务逻辑。来源与边界见 [工作台设计](../../agent-gui/DESIGN.md)
和 [V2 对齐计划](../design/quicker-rpc-plugin-v2.md)。

首轮设计器验收入口是 `agent-gui` 下的 `pnpm check:agent-offline` 与
`pnpm check:action-designer`。后者使用真实 React 编辑器和隔离 Edge 页面，覆盖连续编辑、
嵌套页签、文件引用、撤销/重做、源码切换、保存中的新草稿、watcher 先到回执、保存失败、
外部冲突和跨文档晚回执；它不连接真实 Quicker，也不能替代 A2 的宿主写回验收。
同步链以精确字符串保留超出 JS 安全整数的合法 Int64 版本，覆盖工具参数、CAS、磁盘戳、
trust、状态比较及冲突展示。普通保存只写工作区；显式 Sync 等到 stamped info 被当前文档
确认后才解锁，读回失败保留草稿并阻止覆盖，不重放已成功的宿主写入。
V1 已绑定 source bundle 的 dry-run 还检查原生变量默认值，递归拒绝对象/数组并给出准确
位置与 `default.file` 提示；不会把此 V1 限制施加到 V2 或未知 profile。

<a id="refactor-execution-plan"></a>
#### 完整实施计划与并行分工

最终交付是一套桌面工作台：用户打开动作后，同一设计器可以在 V1/V2 上读取、人工编辑、
让 Agent 修改、检查差异、校验并保存；始终显示并绑定目标宿主。新功能扩展复用已有
Agent 执行循环、文档会话、权限和工具服务。代码整理、界面配色、离线 fixture 或计划
文档本身都不构成整项完成。A0–A5 是交付主线，R0–R8 是全程质量要求，均保留验收。

**持续执行也是目标的一部分**（用户于 2026-10-23 明确授权）：Agent 自行开发、创建 PR、
跟进 CI、独立审查与修复、自行合并并推送，完成必要的主线集成验证后继续下一项；不在
“PR 已开”或单个阶段完成时结束整个目标，也不逐个 PR 请求重复确认。各并行对话遵循
[仓库执行约定](../../AGENTS.md#pr--publish-instructions)，集成对话持续维护依赖、状态和
剩余验收。只有既定目标完成、用户明确暂停/调整或确需外部输入时才相应收口。

**现有基线**：宿主握手、V1 source bundle/codec、独立 Node chat service、隔离资料根、
设计器多 surface/history、完整 body snapshot、模块目录、外观属性与保存票据已实现。当前主界面仍依赖
Next；V2 source adapter、宿主多实例绑定和静态 runtime 已完成首轮离线集成与编译。V1 专用动作
的 source 连续写回、重读、冲突和部分 checkpoint 恢复已验证；真实双宿主、实时 Agent/Designer
文档共享和完整新版设计器仍未验收。
本节状态必须随实现更新，不把“分支已编译”写成“主产品已可用”。

| 并行工作包 | 独立交付与主要文件所有权 | 现在可做 / 依赖 | 完成证据 |
|---|---|---|---|
| P1：当前对话，设计器与文档整合 | A1、A3 及 R3–R7 的界面整合；`components/action-editor/`、`lib/action-editor/{program,steps,variables,document,toolbox}/`、workspace editor；最终维护本计划 | 先完成模块目录、属性草稿/本地保存和完整设计器来源清单；真实宿主绑定依赖 P2，V2 native 文档依赖 P3 | 生产入口可操作，真实 DOM 与深浅/窄窗通过；UI/Agent 共用文档 revision；双宿主完整编辑闭环后才算主线验收 |
| P2：独立对话，宿主发现与写入绑定 | A0；Contracts/Transport、bootstrap endpoint、Console/serve/MCP 的发现/选择/连接；Agent qkrpc transport 的绑定与重试约束 | 可立即独立实现；先收敛 DTO 与错误码，兼容当前握手；不迁移 codec 或设计器组件 | 两个 fake 宿主并存、唯一候选自动选择、多候选明确选择、断连/重启/旧插件、取消均有回归；绑定写入绝不落到另一宿主；V1/V2 活进程身份验证 |
| P3：独立对话，V2 source 与动作端口 | A2；`Plugin.V2/` source/codec/persistence adapters，必要的共享 AgentModel/Runtime source 入口与测试 | 可先基于现有 source host 接口实现和离线 roundtrip；真实写回依赖 P2 的目标绑定 | V2 原生 source 读取→修改→dry-run→保存→重读；未知字段/文件、版本冲突、Designer 内存态、取消与部分保存有证据；不复制 V1 Runtime，不凭版本开启能力 |
| P4：独立对话，去 Next 与服务生命周期 | A4、R0/R2 的 runtime/打包部分；`lib/agent-service/`、`service/`、HTTP adapters、renderer 启动入口、Electron 资源/进程组合 | 可立即迁移 API/资源与静态 renderer；沿用当前 React/AI SDK；Designer 业务文件由 P1 拥有，qkrpc 协议由 P2 拥有 | 静态 React + 独立 Node 从干净目录启动；会话/审批/取消、设置/历史/workspace API、Launcher、资源和原生模块、退出/升级均通过；最后删除 Next 生产依赖与兼容分支 |
| P5：整体验收后，通信优化 | A5；Designer bridge/Transport 性能 fixture、缓存与增量实现 | 先定义测量负载；协议选择与替换等待 A1–A3 闭环 | 有同机可复现前后数据；端到端耗时、载荷、内存、取消/背压/重连均不倒退；保存身份/revision/错误语义不变 |

P1/P2/P3/P4 并行推进。对话使用各自独立 checkout/worktree 和 `codex/` 分支，禁止在
同一 `main` 工作目录互相切分支或覆盖文件；只提交 qkrpc 子仓库，不提交父 workspace。
共同 DTO、错误码或 API 签名先形成小的契约提交，再由依赖分支吸收；不用复制接口或
各自创建不同的同名契约。暂缺依赖时使用显式 fake port 继续实现，保留实际集成门槛。

**文件与运行资源协调**：跨所有权文件通过小提交交接；P1 负责文档会话与设计器调用侧，
P2 负责宿主连接调用侧，P3 负责 V2 实现，P4 负责 HTTP/desktop 组合。共享 tool registry、
顶层 workspace API route、CI 清单和 lockfile 的改动需单独说明，避免大范围格式化。
独立分支使用自己的依赖/输出目录；不得占用当前 `:3000`、并发热更同一 Quicker 插件或
抢装同一 CLI。分支先编译与隔离测试，进入集成分支后统一串行 `build.ps1 -t` 和真实 UI
验收。每个工作包以可审查 PR/提交交付，合并和实际部署是另一项证据，不能互相代替。

**检查点及依赖**：

1. **C0：契约稳定**。明确 host instance/session/endpoint、storage identity/version、文档
   revision、save ticket 与结构化错误。旧插件、缺失 capability、未知字段不能靠猜测补齐。
2. **C1：设计器本地闭环**。来源组件已接生产入口；完整正文、嵌套子程序、模块目录、属性、
   文件引用、撤销/重做、dirty 和异步保存可操作。body/metadata 落盘分别反馈，失败或晚回执
   不能清除较新的草稿；外部修改不能被静默覆盖。
3. **C2：双宿主闭环**。在 C0 基础上分别验收 V1/V2 的专用测试动作；载入、修改、校验、
   保存、重读绑定同一目标。重启、冲突、Designer 打开、取消、部分保存均进入验收矩阵。
4. **C3：Agent 与设计器协同**。手工和 Agent 交错修改有明确 revision，修改能回到同一
   设计器检查并保存；Ask/审批/父子权限、取消与历史格式保持兼容。不得另开平行写入通道。
5. **C4：运行架构收口**。P4 的服务与 renderer 接回 C1–C3；完整用户流程、隔离资料升级、
   原生模块/资源和进程退出验证完成后移除 Next，保留的数据与动作格式无强制迁移损失。
6. **C5：性能与最终审计**。完成测量及有证据的优化；逐项关闭 A0–A5、R0–R8 和下表
   设计器缺口，检查旧入口/临时兼容分支去留、CI 与文档一致，再判定整个重构完成。

**设计器迁移清单**（来源 `QuickerPc/Quicker.Headless/Web/src/`，版本差异留在 adapter）：

| 来源区域 | 必须覆盖的交互与数据 | 当前事实 / 下一步 |
|---|---|---|
| `ActionDesignerPage` / `ActionDesignerEditorPane` | 文档载入、保存、脏状态、宿主目标、版本冲突和外部更新 | 磁盘入口已接 body controller、持久目标展示/保存票据与完整身份 CAS；原生 V2 storage、选择宿主和 Agent 实时会话仍待接线 |
| `ProgramEditorTabWorkspace` / active bridge / snapshot | 主程序、递归子程序、多 surface、切页、选择和撤销/重做 | 首批迁入并有真实 DOM 回归；主/嵌套正文、变量和三项属性已共用 Session present/history，surface 不再有独立 timeline；按钮/快捷键、portal、未 blur 草稿 flush 和晚保存已通过真实 DOM。子程序属性与内部字面引用重命名已接线；创建/删除继续迁移 |
| `XProgramEditor` / steps / param editors / variables | 模块插入、参数编辑、分支、变量、文件引用、即时草稿与校验 | 已有编辑器继续复用；逐项对照新版行为，不以旧代码存在作为迁移证明 |
| `TreeActionToolbox` | 真实分类、搜索树、控制字段/预置参数、拖放位置与双击插入、编辑确认与撤销 | 已接生产工作区，分类/搜索与预置参数通过原参数确认、撤销和完整文档保存链；真实 catalog 未提供的统计/收藏等继续待适配 |
| `EditorResourcePane` / `ResourceExplorer` | 动作/全局子程序目录、分页/定位/选择、必要编辑操作及刷新 | 七组 catalog 请求已接文档 port 与目标隔离；动作/子程序完整目录、分页和操作仍待迁移，不能以受限搜索冒充完整目录 |
| `ActionMetaEditor` / context menu | 外观、运行/更新选项、关联、自定义右键；与正文统一 dirty/版本/保存 | 标题/说明/图标已接同一文档 revision、dirty 与保存票据；本地 body/metadata CAS 及部分写入分别反馈。完整图标选择器及其它字段须补原生 catalog/presentation 契约后开放，仍属于完整迁移范围 |
| 外置文件与 source bundle | `files/`、脚本/变量默认值引用、未知原生字段、YAML 与 native codec | V1 source 与磁盘保真已有基础；metadata 原始字段、V2 codec 和 UI source 接入继续验收 |
| 运行/诊断 bridge | 已确认范围内的 run/trace、失败定位、取消与结果展示 | 复用现有 RPC/Agent 服务；新版设计器调用侧与宿主能力逐项接线 |

普通保存只写本地工作区。显式 Sync 已在同一文档写入队列内先保存正文，再用返回的精确
版本提交变化的标题/说明/图标；全部确认后才推进本地版本及同步信任。属性拒绝、响应丢失、
版本缺失和取消不会把部分结果标成已同步。同步期间当前文档暂停编辑，晚回执不能影响另一
文档。两次宿主 RPC 仍是分步保存，不能宣称为原子事务；实际 V1/V2 写回验收依赖 P2/P3。
本地 JSON 往返和 CAS 指纹保留未知字段中的 Int64、高精度数值及数组；已验证真实落盘、
并发同步与本地保存、部分写入重试和外部冲突。该证据来自隔离 fixture，不替代宿主验收。

**Agent 与工作台的剩余任务**不因转入设计器主线而取消：R1 补操作描述与 TurnPlan 约束；
R2 补浏览器/网络端口及派生进程 owner；R3 拆会话控制器并验证后台会话/审批/草稿；R4
统一消息和工具摘要投影；R5 将面板静态定义与会话实例状态拆开并接已有文件/终端/浏览器；
R6 验收 V1 YAML 真实宿主链；R7 检查主题、浮层、焦点、键盘、长会话与失败态；R8 落实
依赖边界检查和最终逐项审计。P1 集成时按这些验收条件推进，P4 承接运行/打包相关项。

R1 审计发现兼容 get 会顺带导出文件：Ask 的动作/子程序读取已改为显式只读端口，
只通过带 `--no-bootstrap` 的 CLI 读取现有绑定宿主，不导出、不进入自启动 HTTP pool，
也不失败重试或回退。最终 mode guard、历史审批续跑、子代理和直接 Ask 调用均覆盖；
Agent 的兼容导出保留。生产假 CLI/HTTP、文件写入 spy 及 SDK 审批回归通过独立审查，
整合后 682 项离线/类型检查通过。
后续收口已将依赖自启动 adapter 的远端查询、恢复、catalog、FA、设置和 Launcher resolve
移出 Ask 默认目录，并在最终执行入口拒绝旧审批与显式调用。远端 diagnostics 也关闭；
pre-turn 不查询实时 Designer 状态，保留消息/embed 的明确目标。workspace 通过显式本地
读取端口，覆盖正文/summary/文件和列表；缺正文不补空或导出，列举子程序不远端修补。
getter 的连接或超时失败保留原错误/exit/绑定，既不伪装成功，也不建议 Ask 的禁用恢复工具。
相关 28 项定向回归、三类目标/三种磁盘状态的生产读路径及 SDK 审批/子代理通过独立审查。
整合后 696 项离线/类型检查及移位静态 renderer/Node API、frontend check、所属进程清理通过。
外部 qkrpc MCP 的兼容 get 未声明只读，SDK 默认 false，已确认不会被 Ask 外部工具过滤器放行。
未接通非启动端口的能力逐项恢复，操作描述、TurnPlan 与外部工具语义审计继续进行。

旧 JSON 动作项目已加入 `.qkrpc/project-binding.json`，CLI/MCP/serve/Agent 的导出、创建和
同步跨请求保留来源宿主，写前核验 action ID、目录和 info；多个同 ID 项目不取首个，
未绑定旧项目不自动继承当前连接。C#/Node 共用项目 lease，部分 bootstrap 不重发宿主创建，
generic 文件工具不能改写此记录。`0.14.8.159` 已安装/热更，V1 专用动作已完成 JSON 导出、
错误会话拒绝、正确目标 apply，再以新 YAML bundle 重读确认外置资源逐字一致，未运行动作。
主动作设计器的目标读取/展示、保留草稿的晚加载、不可变票据、完整身份 CAS 和 Sync
精确目录已接线。560 项离线 Agent、102 项 Console、12 项真实浏览器及后续针对回归、
深浅/窄窗截图检查通过；移位后的静态 React/Node 产物也以实际 HTTP 验证本地 target
读取、bound/unbound Save、旧客户端/改绑拒绝及零宿主调用。`0.14.8.160` 已在主线安装/
热更，540 个用户 CLI 文件与发布源校验一致；实际 HTTP target → 错误身份拒绝 → 本地
Save → 绑定 Sync 已在专用 V1 动作验收。正文与属性分别写回后，以独立 metadata/source
重读核验步骤、说明和外置资源，最终两侧版本一致且 in_sync，未运行动作。主产品开发态
frontend check 也已通过；真实 GUI 点击、进程重启、双宿主及 V2 活进程继续独立验收。
运行/调试/宿主编辑器/悬浮在此入口暂禁用，删除只清理本地项目；后续恢复必须显式绑定。
文档级 catalog 请求/缓存已完成绑定；多宿主选择、原生 V2 存储和 Agent 实时文档协同仍未完成，不能以本地
CAS 代替整个编辑会话已统一。主文档及嵌套 surface 现在共享独立 catalog port：七组 API
携带完整持久目标，服务端在 RPC 前后核验精确目录与记录，并使用显式 host binding。
loading/unbound 在浏览器和服务端均不查询宿主；失配、断连、取消或原生失败不会使用
静态回退。缓存与迟到结果按文档 owner/完整目标隔离，共用请求只在最后消费者退出或
文档关闭时取消。实际生产链同时补齐 step-runner list 的 TS/serve 映射，并修正 getUi
分发大小写。客户端、服务端及交叉边界已独立审查；相关真实 Edge 交互分组通过，
吸收当前主线后的 583 项离线检查、类型与 71 路由检查通过；后续安装/活进程验收单独
记录，未把此切片标为完整资源目录迁移。
FA resolve 也已接相同文档 port：APDE 标题、嵌套预览、步骤旧预取和 portal 按 Provider
存在与否区分文档及旧入口，loading/unbound 不读全局持久缓存或默认宿主，绑定失败不回退。
同 spec 的几何与迟到结果按 owner 隔离，服务端沿用项目 lease 和 RPC 前后目标核验。
其它旧入口保留全局缓存兼容，导入模块不再主动读取持久存储。当前复用已有 FA RPC，
该文档绑定切片未新增 C#；完整搜索分页/风格与账号上传库仍待接端口，V2 几何读端口
的当前边界见下文，不能以绑定预览代替完整图标选择器。
吸收当前主线后的 649 项离线检查与两项完整真实 DOM 通过；实际步骤列表、标题和 portal
覆盖多 owner、迟到结果、加载/未绑定以及旧入口兼容，独立复审通过。纯 catalog 的依赖图
已确认不含 TSX。PR23 合入主线后，主产品 frontend check 通过；实际 162 V1 插件以
完整绑定解析 `fa:Light_Flask` 得到真实向量，缺失绑定与完整目标失配均返回 409，专用
动作版本未变，零宿主写入且未运行动作；该 HTTP 证据不代替真实 GUI 点击或 V2 验收。
trace 展示也仍有独立缺口：现有 bridge/页签按 actionId+param 全局
复用，需由执行侧与 UI 共享每次运行 owner，再处理终结、清理与历史重放；仅把 key 换成
未保证全局唯一的 SDK toolCallId 不能证明跨会话隔离。此项继续归 R2/R4 验收。

catalog 切片已合并并在 `0.14.8.161` 的真实 V1 验收七组 HTTP 目录读取、未绑定及完整
目标失配拒绝；专用动作版本未变、无宿主写入或运行。主界面 frontend check 通过。首次
构建的插件重载/CLI publish 成功，用户安装遇到 MCP 占用而明确报失败；随后仅修复六个
不同文件，540 个用户 CLI 文件与发布源校验一致，CLI/serve/插件均独立确认是 161。
同版重跑构建会碰到已加载的插件 DLL，不能把这次构建记为整次成功；安装复制计划与进程
退出确认修补已合并并通过 Windows 共享锁及 fake 进程回归，真实自动升级仍单独验收。
自动审批拦截了后续安装脚本重跑，未重复执行该动作。

后续安装实现已收紧进程归属：PS 安装只匹配目标目录的确切 `qkrpc.exe`，构建只管理
当前仓库发布目录与显式 host/port/argv 一致的 serve；停止前重新核验保留句柄、路径和
创建时间，不再按名称、前缀兄弟目录或整棵进程树终止。陌生端口在发布前明确拒绝，
就绪检查同时验证 socket owner 与服务协议，启动失败只回收自己创建的 child。Inno
安装器已移除全局 taskkill 并关闭自动结束/重启应用；目标文件仍占用时不能静默代停，
自动停止该安装副本的 Setup 能力继续待适配。fake、生成文件锁及本次自建休眠进程矩阵
通过独立审查；Inno 仅编译验证，Setup 的实际升级继续单独验收。

下一项设计器基础已在纯 session 加入 80 条完整文档历史：主/嵌套正文、未知字段和已支持
的标题/说明/图标共用事务，undo/redo 比较完整身份及 revision，保存/部分确认不倒退宿主
版本或清除历史。九项新回归及相关 59 项纯层测试、类型检查与独立代码审查通过。主动作
界面现已接同一 Session：所有 surface 即时投影，原本各自的 present/history、Workspace
初始快照和 overrides 已移除。统一按钮/快捷键、portal、属性及未 blur 步骤/变量草稿 flush
已通过 17 项真实 Edge DOM；吸收 PR18 后 622 项离线检查、类型检查及独立审查通过。最终深浅/
480px 截图使用真实 bundled SVG，工具栏、属性输入及所有 clipping 祖先范围均已检查。
吸收当前主线后的移位静态 React/Node 也通过实际 API、renderer、frontend check 和所属进程清理验收。
独立 X 入口保留原本历史。子程序名称/说明/图标及其内部字面调用重命名已补纯文档事务：
完整目标与 revision 校验、稳定 ID、重复/歧义拒绝、内部递归和分支引用共用一次历史；
外部缓存、动态绑定及任意表达式不改写，未知字段和数值保留。原生 `$=` / `$$` 前缀名称
使用固定 C# 字符串常量表达式作为调用值，下一次改名只解析该完整规范形式，不执行名称。
已接受的长短字段别名保留原命名，冲突整次拒绝。属性弹窗已接生产页签的双击/上下文
菜单，打开和应用前 flush，身份或原属性变化时保留草稿并拒绝覆盖；隐藏、取消确认、
焦点和普通文字 undo 有明确归属。吸收 PR23 后，650 项离线检查及单次完整 20 项真实
DOM 通过；移位的静态 renderer/Node API、frontend check 和所属进程清理也通过。
相关纯层及独立审查通过，窄窗深浅截图已检查。fixture 每项使用自己的 Edge/profile，
并检查预期退出；原生文字撤销用一次原生插入验证单次 undo，不依赖操作系统对逐键
输入的分组。旧长批次
的 native 提前退出保留失败证据，未重试或吞掉错误。完整图标选择器、资源目录和
Agent live 文档协同继续迁移，当前证据仍不替代真实 V2 或完整双宿主设计器验收。

内部子程序的创建/删除已接入生产页签菜单和纯文档事务。创建使用调用方稳定 ID，
追加根定义并沿用 Web 名称生成；删除预览属于原 Session，携带完整身份、revision、
目标指纹和引用位置，确认后再次检查。原生子程序调用和文本操作 `$sp$` 引用会阻止
删除；外部缓存只读，动态表达式不求值，也不宣称能证明其不存在调用。创建/删除均
进入一次已有历史，保留未知字段、精确数值和文件引用。74 项文档层回归、类型检查与
独立审查通过，集成端另验相关 19 项。空目录也有新建入口；关闭标签只关闭视图。
删除前先 flush 所有已访问编辑器，以程序名、步骤位置展示阻断引用；确认前再次 flush
并按原预览核验。隐藏、切文档或卸载会作废删除票据，迟到保存不会复活已删定义；
弹窗独占键盘和底层交互。相关 controller/纯层 17 项、整合离线/类型检查 676 项和单批真实 Edge DOM 24 项通过，
深浅主题的确认框与 420px 引用列表截图、独立审查通过；仅使用隔离 fixture，未删除
真实 Quicker 动作、子程序或磁盘项目。完整图标选择器及 Agent live 文档协同继续迁移。

兼容 JSON 的 TS/C# compact writer 现在按现有 reader 规则转义字面 `@var:`、`@file:`、
`@value:` 前缀，反复保存不会把文本变成绑定或持续增加转义层；真正的变量/文件绑定、
对象、数组和未知数值保留原语义。V1 YAML `lit` 原文直接保留，不套用兼容 JSON 的转义。
两侧 codec 已独立交叉审查，真实 compressor/parser、磁盘 normalization 与 YAML/native
roundtrip 回归通过；生成的 CLI/Agent 知识也已同步。`0.14.8.162` 已以新的受限进程实现
完成整次热更（exit 0），540 个安装文件与发布源逐一一致，无手工修补；CLI/serve/真实
V1 插件均独立确认版本与新会话。专用验收动作完成 YAML `lit` 保存、真实压缩 wire 重读
和恢复：前缀保留，原变量绑定及外置文件不变，始终禁用且未运行。fresh bundle 的生成
stepId 因已知空默认字段规范化而重算，已对照代码和原生基线解释，不宣称原生字节完全还原。
这次实际 PS 更新不替代 Setup、V2 或完整双宿主设计器验收。

V2 设计器读取已补两个原语：UI 参数详情使用完整 serializer，Agent 详情仍保留压缩格式；
非空步骤摘要只调用精确的原生只读 leaf，使用既有 Application dispatcher，不初始化
Headless/Agent/账号栈。缺失 Designer 的十个 Runtime 入口返回现有类型的明确失败，
预取消不访问宿主，原生读取的迟到结果不交付。实际 Plugin.V2 与 Runtime 三目标编译、
15 项定向测试及不引用 V2 的 6 项相关测试通过，独立审查通过；另跑 31 项 composition
有 6 项环境/原生依赖失败，未对照干净基线，不宣称全类通过。DesignerUi 仍关闭，
V2 活进程、完整 catalog/FA 和双宿主设计器继续独立验收。
该读取基础已随 `0.14.8.163` 完成整次 PS 热更（exit 0），540 个安装文件与发布源
一致，CLI/serve/真实 V1 插件版本及新会话已确认；V1 参数 UI 详情和 FA 几何读取
通过，专用动作版本未变、无额外宿主写入。主产品 frontend check 通过，此次 V1
集成不代替 V2 活进程或 Setup 升级验收。

V2 Designer port 已补独立 quick insert、toolbox 搜索与 FA 几何读取，按实际已加载的
精确原生 API/DTO 和既有 dispatcher 分别声明 capability；不抬高旧 DesignerUi，也不
初始化 Headless/Agent/账号服务。每 host 的 catalog snapshot 独立，取消/空结果不发布，
原生分页 JSON 保留；旧 FA search 的语义尚未对齐，继续明确不支持。实际 Core DI 与
manual 组合已覆盖，原有两处 DI 接线缺陷一并修复。25 项定向测试、7 项无 V2 引用
相关测试、真实 Plugin.V2 与 Runtime 三目标构建及独立审查通过。尚未验收活 V2 加载态，
缺少已加载类型时保持不可用；完整资源/图标目录及双宿主继续验收。

`0.14.8.164` 已完成整次 PS 热更（exit 0），540 个安装文件与发布源一致，真实 V1
新会话同时声明三个兼容读 capability，主产品 frontend check 通过。此证据继续属于
V1 集成，不代表 V2 已启动或这些可选原生类型在 V2 中已加载。

完整 FA 分页已补共享 wire/可选 host port 和独立 `designer.fontAwesome.page.read`。
V1 用全 enum 及来源中英文评分，V2 匹配精确 native SearchPage/七字段 DTO；保留完整
total、样式和分页事实，不改变旧 maxResults/expand 搜索。原生缺失、页事实失配和取消
明确失败，既有 dispatcher 和完整 host binding 继续约束读取。通用 ResolveType 会补载
satellite，三个旧 read factory 与新 page 已改为精确已加载程序集查找，避免探测触发初始化。
V1 15 项、Runtime 22 项、无 V2 引用 7 项及 Transport 14 项通过；独立审查修正了原 owner
断线测试和跨 Quicker/Core 的 metadata 检查。当前 2.2.11 编译宿主缺新分页类型，仅验证
PE 缺失/拒绝和固定 DTO；V2 原生算法、活进程及完整图标选择器仍待验收。准备集成版本 165。

R5 文件实例首片已接生产 Chat/dock：已访问文件由工作台保活，切文件、browser/trace、
折叠面板、切聊天/cwd 不卸载 APDE Session、属性草稿或 pending save。active 管理快捷键
与 portal，删除选项不会因隐藏重现被重置；Pin/focus 跟随当前可见 Chat。读写固定
所属 cwd/path，load/refresh/save 的共享读代次与 cache 发布门禁拒绝旧结果，精确项目
删除只释放其路径段内实例及缓存，旧未知回执只刷新。最终集成 674 项离线检查通过，
相关 13 项纯层及 4 项真实完整 provider→Host→APDE DOM 验证通过，深浅/480px 四图
及独立审查通过；完整静态面板定义、native browser/terminal、trace owner 和持久草稿
恢复仍待迁移，不把文件保活写成整个 R5 已完成。

R8 已补首条文档依赖门禁，随离线清单递归检查全部纯文档入口及传递运行时依赖，拒绝
UI/服务模块、样式资源和框架指令；保留纯数据及 type-only 引用。真实生产图与 Node、
React/Next、传递 UI/CSS 和 directive 负例共 4 项通过，整合离线/类型检查 686 项通过。
这只约束静态依赖，不能替代 Agent/UI 实时协同、动态 API 或最终整体验收；R8 继续开放。

**每个 PR 的验收与合并要求**：

- 改动说明包含用户可见结果、来源组件、负责层、已知缺口和实际验证命令；不把 fake、
  编译、主产品 UI、宿主活进程或打包安装验证混为一项。
- UI：TypeScript、相关纯测试、真实编辑器 DOM 回归、深浅/窄窗/键盘/失败态，以及集成
  开发态 frontend check；本地真实浏览器检查继续独立于无浏览器二进制的离线 CI。
- RPC/codec：共享目标框架与相关 fake tests；V2 真项目编译另有证据；合入后串行热更并
  在目标宿主验收。source dry-run 保持离线，真实写回只使用专用测试动作与明确目标。
- Agent/runtime：fake model/transport、隔离 DB/资料根、审批与取消、并行会话、旧历史兼容；
  不运行真实付费模型或接触用户资料来换取“通过”。
- 知识/文档：修改知识源后检查生成物；更新本计划状态和路由；CI 的 knowledge、Windows/
  Ubuntu Agent、host-independent .NET 均通过。当前 CI 不证明 V2 活进程或桌面打包通过。
- 独立审查、目标分支 CI、集成验证、提交推送完成后才关闭对应交付；异常保留明确 owner
  和下一项可执行工作，不用测试总数代替功能验收。

重构目标是让权限、执行生命周期、会话状态和展示扩展各有唯一归属，新增能力无需复制
Agent 循环或修改贯穿整个应用的条件分支。体验原则见 [工作台设计](../../agent-gui/DESIGN.md)，
模块契约见 [Agent 架构](../agent-architecture.md)。

| 阶段 / 优先级 | 用户问题与交付边界 | 负责功能域 / 代码锚点 | 依赖 | 验收门槛 | 状态 |
|---|---|---|---|---|---|
| R0 / P0：可信基线 | 重构前先知道什么真的能跑；隔离用户数据、宿主动作和付费模型请求，记录已存在失败 | CHAT / AUTHOR / WORKBENCH；`package.json`、离线 fixtures、`agent-harness/*.test.ts`、`qkrpc-argv.test.ts` | 无 | 有可重复的离线检查入口；不自动启用真实 Electron/动作删除测试；已知失败明确归因，不写成全部通过 | 离线入口、DB fixture 隔离与临时目录本地清理已实现；静态 Electron 打包与 Windows Job 隔离启动、所属进程回收已验收，smoke 内 RPC 禁用。安装/升级、旧资料和真实动作仍单独验收 |
| R1 / P0：能力与父子权限 | Ask、命令 allowlist、MCP 和子代理不能互相绕过；空交集不能恢复全部工具 | EXT / CHAT；`select-chat-tools.server.ts`、`turn-runtime.server.ts`、`agent-mcp/`、`task-tool.server.ts` | R0 | 未指定与显式空集合分开；最终工具集取所有限制的交集；未知风险 MCP 不进入 Ask；子代理复用父工具策略闭包，无递归 task；Ask 浏览器当前关闭，后续须以仅连接已有会话、无导航/启动副作用的观测端口逐项验收再开放 | 首轮权限边界已实现；操作描述与 TurnPlan 执行约束仍待统一 |
| R2 / P0：取消与资源生命周期 | 点击停止、关闭连接或运行失败后，不继续悄悄请求模型、重试或占用工具连接 | CHAT / WORK / EXT；`api/chat/route.ts`、`run-turn.server.ts`、`stream-loop.server.ts`、工具上下文及 transport | R1 | 请求信号贯穿模型、压缩、工具和子代理；取消不转换成重试；MCP/reader/计时器至少有明确 owner 且只释放一次；两个并行 turn 互不取消 | 模型、压缩、qkrpc、Shell、MCP 首轮取消链已验收；web_search 三 provider 已贯通父 turn 与 SDK/显式信号、请求及正文、晚结果检查和独立 timeout，fake 回归通过。headless/embedded 已补独立 HTTP request owner、按 session 串行的 native tail、协作等待和实际共享状态提交前检查；取消不关闭共享页面。相关 fake 回归覆盖断连、排队、迟到原生结果和微任务竞态并通过独立审查；真实 Playwright/Edge 已用自有 profile、loopback 和可控 native gate 验证运行/排队 HTTP 取消、native tail、并行 session、原 context/ref 复用及浏览器关闭；snapshot/pick 的函数字符串未调用缺陷已修，真实采集与坐标点击通过。Electron 原生、用户浏览器及其它资源 owner 继续单独验收 |
| R3 / P1：会话控制与可见性 | 常驻隐藏会话仍可能响应全局输入；页面组件混合消息、审批、滚动、设置与 Launcher 生命周期 | CHAT / WORKBENCH；`Chat.tsx`、`useAgentChatSession.ts`、`ChatComposerFooter.tsx`、Launcher bridge | R1–R2 | 后台运行可以继续，但全局快捷键只归前台 owner；切会话保留草稿与审批；控制器持有业务状态，展示组件只消费明确契约 | 隐藏输入、IME 与面板串会话已验收；执行事实按 turn 隔离并移除 thread 全局 Map；历史消息编辑已移入单会话 controller，隐藏会话保留草稿且不响应前台 Esc/pointer，迟到确认通过实时 SDK store CAS 后才截断和发送。614 项离线检查、真实 controller/SDK/modal 与 ChatPanel/composer/假 SSE 回归通过独立审查；滚动、布局、审批和其它会话职责继续拆分 |
| R4 / P1：消息投影与工具展示 | 工具越来越多时，摘要、工作折叠、详情、失败与流式参数容易各写一套判断 | CHAT / EXT；`ChatMessageArticle.tsx`、`ToolPart.tsx`、`ToolPopupBody.tsx`、消息与结果 helpers | R1–R3 | 同一工具调用以 id/阶段/结果投影；流式未完成参数不当成完整对象；未知工具有通用回退；正文、展示全文、模型摘要与持久历史不混存 | 跟随、显式展开、稳定 call owner 与流式节流已通过离线 SSE/真实 DOM；单条转批量及输入转预览保留详情与焦点，更多工具的摘要投影统一仍待整改 |
| R5 / P1：面板扩展契约 | 快捷入口表还不是可扩展工作台；增加文件、结果或动作面板仍可能扩写多处 switch | WORKBENCH / WORK；`agent-workbench-features.ts`、`workspace-explorer.tsx`、`WorkspaceSidePanelTabBar.tsx` | R3–R4 | 面板静态身份、renderer 与会话实例状态分离；已有文件/资源/终端/浏览器接入同一契约；脏编辑和正在运行的任务不会因切换呈现而卸载 | 文件/Designer 实例首片已与 Chat/dock 呈现解耦，稳定 portal、单 Session、读写回执与精确项目删除已验证；完整静态面板定义与 browser/terminal/trace 实例契约、持久草稿恢复仍待迁移 |
| R6 / P1：V1 YAML 完整接入 | 贯通既有 CLI/MCP source bundle 与 QuickerAgent 工具、展示和知识路由 | AUTHOR / RPC；`qkrpc-action-source-tool*`、`qkrpc-tool-call*`、`qkrpc-argv.ts`、`qkrpc-http.ts`、source bundle 与 codec | R1；复用现有文件与结果展示，不依赖专用面板 | open/save 的 CLI、HTTP、cwd、dry-run 等价；Agent 可走现有 V1 YAML 流程；未知字段、外部文件、连续保存、冲突与 Designer 保护保留；V2 原生 MCP 路径不混入 V1 | 工具、cwd/sidecar 门禁与知识已接入；真实 V1 专用动作连续保存、外置默认值和步骤绑定重读、目标/版本冲突及 checkpoint 部分成功恢复已验证。Agent/Designer 完整协同与打开 Designer 的真实保护仍待验收 |
| R7 / P1：交互与样式完整性 | 只检查主页面截图会漏掉浮层、焦点、键盘、窄窗口、错误和加载状态 | WORKBENCH；`theme.css`、`globals.css`、模型/设置/侧栏/Composer 组件 | R3–R6 | 主题只有一个 token 来源；样式按组件职责归位且顺序可控；浮层可用键盘进入/退出、恢复焦点、适应边缘；深浅/窄窗/长会话和失败状态逐场景检查 | 待实施 |
| R8 / P1：收口与持续验收 | 文件移动和测试数量不能证明架构完成；旧入口与隐性全局状态会重新长回来 | 全功能域；架构检查、离线 Agent scenarios、UI fixtures、工程说明 | R0–R7 | 关键依赖边界有可执行检查；代表性场景跑通且新旧格式兼容；遗留分支有用途或移除；文档与实际能力一致；每项未完成条件保留，不将缺口标为完成 | 待实施 |

每个切片按「确认现行为与失败用例 → 最小正确实现 → 针对性测试 → 真实 UI（如受影响）
→ 独立审查 → 提交与推送」推进。一个阶段允许多次可验证提交；只通过静态扫描、
改了目录或增加抽象不算验收。离线 fake transport/model 与隔离目录优先，不能把
“临时目录”当成真实 Quicker 动作、用户数据库或系统进程已经隔离的证明。

首轮切片覆盖权限交集与父子策略、请求取消、隐藏 Composer 输入、会话面板归属和
`action.open/save` transport 映射。同线程并发 turn 标记已独立归属。仍需持续处理 Skills 缓存
修订标识、只读浏览器观测端口、更多工具摘要投影、静态面板描述与实例拆分，
以及 YAML 流程的真实宿主专用测试动作验收。后续审计按所属阶段补入验收条件，保持已实现、修复中与
待实施分开。

### 其他产品缺口

| 优先级 | 缺口 | 完成条件 |
|---|---|---|
| P0 | net10 未完全覆盖 net472 | V1 能力逐项等价或明确不支持；capability、离线测试和活进程 smoke 一致 |

新增规划项必须包含用户问题、入口、负责功能域、代码锚点和验收方式；只有想法或实施步骤的内容进入 Issue，不再新增平行 roadmap。
