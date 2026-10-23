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
dry-run 完全离线，成功保存更新基线而不重写用户源。V2 动作使用 Quicker 原生 MCP。

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
- RPC/CLI health 已返回宿主类型、版本、本次加载 session 与动作能力；实例选择、写入目标绑定和 V2 source/codec 仍待完成。
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
其余 API 分组、静态 renderer、桌面资源打包和真实资料升级仍待实施。

#### 统一 RPC 与动作设计器：当前主线

用户已明确新的产品目标：同一 RPC 自动识别 Quicker V1/V2，Agent 与动作设计器共用
动作服务；**下一项用户可见交付优先搬入 Quicker 项目的新动作设计器**，之后才研究高效通信。
所需服务 API 随设计器竖切片迁移。以下是近期交付顺序；R0–R8 继续作为质量与遗留缺口清单。

| 顺序 | 交付与边界 | 负责入口 | 验收门槛 / 当前状态 |
|---|---|---|---|
| A0：宿主与编辑契约 | 暴露宿主身份、会话、协议/schema 版本与逐能力声明；绑定动作存储身份和 revision | Contracts、Transport、Host.Abstractions、V1/V2 adapters；[统一动作边界](../agent-architecture.md#统一宿主与动作编辑边界) | 一个兼容实例自动选中；多实例明确选择；断连不把保存切往另一宿主；未知/不支持能力返回结构化错误。已实现 wire 握手与 bootstrap session，旧插件保持身份未知；V1 活进程已核验。实例发现/专属 endpoint、选择与写入绑定仍待实现 |
| A1：搬入新版设计器（首要界面交付） | 复用 Quicker 新 Designer 的 React 组件、结构化动作模型、catalog/session/workspace bridge 语义，先接 fixture，再接统一 RPC；保留黑白灰深浅主题 | `agent-gui/lib/action-editor/`、现有设计器 UI；Quicker `Quicker.Headless` Designer/Web 源 | 按来源清单迁移步骤/参数、变量、catalog 资源、嵌套结构、选择/撤销/重做、脏状态与保存；保留 qkrpc 外置脚本/默认值文件，连续多次编辑后的保存须与可见文档一致，完整 roundtrip 保留未知字段。已迁入多 surface workspace/live snapshot，接入统一文档 revision、保存票据和保真落盘，真实 DOM 回归通过；当前接既有磁盘项目，metadata/catalog 与完整 host session 接线待迁移 |
| A2：V1/V2 真实动作读写 | 同一动作端口调用不同宿主 adapter，补 V2 native source/codec 与必要 Designer 能力；优先动作编辑链，不等待所有 publish/Chrome 等能力对齐 | Runtime、Plugin.V1/V2、source bundle/codec；[V2 对齐计划](../design/quicker-rpc-plugin-v2.md) | 两版本分别验证读取→编辑→校验→保存→重读，以及版本冲突、宿主 Designer 内存态、重启、取消和部分保存；未完成能力保持关闭。当前 V1 source 可用，V2 source 尚不支持 |
| A3：统一 Agent 与编辑会话 | Agent 工具、设计器操作共享目标身份、编辑会话、权限、校验和保存结果；保留 AI SDK 单一执行循环 | Agent application/tools、Designer host bridge、动作服务 | Agent 生成或修改的动作能进入同一设计器检查并保存；手工编辑与 Agent 并发修改有 revision/冲突处理；Ask 不写、不绕过脏状态或基线。待实施 |
| A4：收口运行架构 | Designer 和 Agent 使用同一 React renderer、独立 Node service 与薄 Electron 壳；迁移所需 history/settings/workspace API 后移除 Next 宿主 | `agent-service/`、renderer 与 Electron 组合入口 | 会话/审批/设计器、用户数据、原生模块与资源、退出/升级验收通过后删除 Next 分支。Node chat 与资料根基础已实现，完整切换未完成 |
| A5：实测后优化通信 | 先测大动作、步骤 catalog、资源与连续编辑；复用现有 typed/protobuf 契约和 catalog snapshot/etag，再比较增量、批量、缓存与传输编码 | Designer bridge、RPC Transport、性能 fixture | 记录载荷字节、序列化/解析开销、延迟分位、内存和取消/重连行为；新方案须有基线收益且保持 revision/错误语义。不预先指定 WebSocket 或二进制重写；待 A1–A3 跑通后实施 |

首个实现切片是 A0 的最小身份/能力契约与 A1 的可运行设计器迁移并行推进；真实宿主写入
必须先满足 A0 的目标绑定。V1/V2 共用 Contracts/Runtime，版本差异留在 adapter；不复制
Agent、工具表、历史存储或设计器业务逻辑。来源与边界见 [工作台设计](../../agent-gui/DESIGN.md)
和 [V2 对齐计划](../design/quicker-rpc-plugin-v2.md)。

首轮设计器验收入口是 `agent-gui` 下的 `pnpm check:agent-offline` 与
`pnpm check:action-designer`。后者使用真实 React 编辑器和隔离 Edge 页面，覆盖连续编辑、
嵌套页签、文件引用、撤销/重做、源码切换、保存中的新草稿、watcher 先到回执、保存失败、
外部冲突和跨文档晚回执；它不连接真实 Quicker，也不能替代 A2 的宿主写回验收。

重构目标是让权限、执行生命周期、会话状态和展示扩展各有唯一归属，新增能力无需复制
Agent 循环或修改贯穿整个应用的条件分支。体验原则见 [工作台设计](../../agent-gui/DESIGN.md)，
模块契约见 [Agent 架构](../agent-architecture.md)。

| 阶段 / 优先级 | 用户问题与交付边界 | 负责功能域 / 代码锚点 | 依赖 | 验收门槛 | 状态 |
|---|---|---|---|---|---|
| R0 / P0：可信基线 | 重构前先知道什么真的能跑；隔离用户数据、宿主动作和付费模型请求，记录已存在失败 | CHAT / AUTHOR / WORKBENCH；`package.json`、离线 fixtures、`agent-harness/*.test.ts`、`qkrpc-argv.test.ts` | 无 | 有可重复的离线检查入口；不自动启用真实 Electron/动作删除测试；已知失败明确归因，不写成全部通过 | 离线入口、DB fixture 隔离与临时目录本地清理已实现；桌面 UI smoke 隔离协议和 fake 检查已实现，打包实机/原生 Job 执行尚未验收，RPC 明确离线 |
| R1 / P0：能力与父子权限 | Ask、命令 allowlist、MCP 和子代理不能互相绕过；空交集不能恢复全部工具 | EXT / CHAT；`select-chat-tools.server.ts`、`turn-runtime.server.ts`、`agent-mcp/`、`task-tool.server.ts` | R0 | 未指定与显式空集合分开；最终工具集取所有限制的交集；未知风险 MCP 不进入 Ask；子代理复用父工具策略闭包，无递归 task；Ask 浏览器当前关闭，后续须以仅连接已有会话、无导航/启动副作用的观测端口逐项验收再开放 | 首轮权限边界已实现；操作描述与 TurnPlan 执行约束仍待统一 |
| R2 / P0：取消与资源生命周期 | 点击停止、关闭连接或运行失败后，不继续悄悄请求模型、重试或占用工具连接 | CHAT / WORK / EXT；`api/chat/route.ts`、`run-turn.server.ts`、`stream-loop.server.ts`、工具上下文及 transport | R1 | 请求信号贯穿模型、压缩、工具和子代理；取消不转换成重试；MCP/reader/计时器至少有明确 owner 且只释放一次；两个并行 turn 互不取消 | 模型、压缩、qkrpc、Shell、MCP 首轮取消链已验收；浏览器/网络端口及派生进程归属待补 |
| R3 / P1：会话控制与可见性 | 常驻隐藏会话仍可能响应全局输入；页面组件混合消息、审批、滚动、设置与 Launcher 生命周期 | CHAT / WORKBENCH；`Chat.tsx`、`useAgentChatSession.ts`、`ChatComposerFooter.tsx`、Launcher bridge | R1–R2 | 后台运行可以继续，但全局快捷键只归前台 owner；切会话保留草稿与审批；控制器持有业务状态，展示组件只消费明确契约 | 隐藏输入、IME 与面板串会话已验收；执行事实按 turn 隔离并移除 thread 全局 Map；会话控制器拆分待实施 |
| R4 / P1：消息投影与工具展示 | 工具越来越多时，摘要、工作折叠、详情、失败与流式参数容易各写一套判断 | CHAT / EXT；`ChatMessageArticle.tsx`、`ToolPart.tsx`、`ToolPopupBody.tsx`、消息与结果 helpers | R1–R3 | 同一工具调用以 id/阶段/结果投影；流式未完成参数不当成完整对象；未知工具有通用回退；正文、展示全文、模型摘要与持久历史不混存 | 跟随、显式展开、稳定 call owner 与流式节流已通过离线 SSE/真实 DOM；单条转批量及输入转预览保留详情与焦点，更多工具的摘要投影统一仍待整改 |
| R5 / P1：面板扩展契约 | 快捷入口表还不是可扩展工作台；增加文件、结果或动作面板仍可能扩写多处 switch | WORKBENCH / WORK；`agent-workbench-features.ts`、`workspace-explorer.tsx`、`WorkspaceSidePanelTabBar.tsx` | R3–R4 | 面板静态身份、renderer 与会话实例状态分离；已有文件/资源/终端/浏览器接入同一契约；脏编辑和正在运行的任务不会因切换呈现而卸载 | 待实施 |
| R6 / P1：V1 YAML 完整接入 | 贯通既有 CLI/MCP source bundle 与 QuickerAgent 工具、展示和知识路由 | AUTHOR / RPC；`qkrpc-action-source-tool*`、`qkrpc-tool-call*`、`qkrpc-argv.ts`、`qkrpc-http.ts`、source bundle 与 codec | R1；复用现有文件与结果展示，不依赖专用面板 | open/save 的 CLI、HTTP、cwd、dry-run 等价；Agent 可走现有 V1 YAML 流程；未知字段、外部文件、连续保存、冲突与 Designer 保护保留；V2 原生 MCP 路径不混入 V1 | 工具、原会话结果展示、cwd/sidecar门禁和知识接入已实现，fake transport回归覆盖；真实宿主写回未在本轮执行 |
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
