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
| HTTP | `lib/agent-service/chat-handler.ts`、`app/api/chat/route.ts` | 标准请求解码、显式 Cookie/preview 与错误适配；Next 只绑定真实 runner |
| Node service | `lib/agent-service/`、`service/main.ts` | 独立 loopback HTTP、背压与断连、懒 runtime、原 API handlers 与可选静态 React；受控切换 |
| Application | `lib/agent-harness/turn-runner.ts` | 通过注入的端口串联 turn 阶段，持有一次请求的取消与资源 owner |
| Server bindings | `lib/agent-harness/run-turn.server.ts` | 将配置、scope、工具和 usage 等真实服务绑定到应用层 |
| Request | `lib/agent-harness/turn-request.server.ts` | 模式、slash、消息修复、LLM selection 标准化 |
| Runtime preparation | `lib/agent-harness/turn-runtime.server.ts` | scope、tools/Skills/MCP、TurnPlan、调用策略、prompt、context budget |
| Agent loop | `lib/agent-harness/stream-loop.ts` | `ToolLoopAgent`、step hook、stream metadata、压缩重试；`.server.ts` 绑定持久化与压缩端口 |
| Domain | `lib/agent-core/`、`agent-recovery-policy.ts` | 无 IO 的决策与值对象 |
| Tool adapters | `lib/tools.ts` 及各 `*-tool.server.ts` | 调用外部能力并返回统一结果 |

### 框架去耦与目标运行边界

当前 Next.js 是现有实现的 HTTP/UI 宿主，不是 Agent 的产品要求。主页面只组合客户端
Chat、启动占位和 Designer URL 参数；当前 72 个 API 路径承担本地服务入口。`/api/chat`
已经只做 Request 解码与应用层绑定，runner/loop 使用 AI SDK 和标准 Response/SSE。
SQLite、文件、子进程、ALS 和 stdio MCP 需要 Node.js，不能据此推导出需要 Next.js。

静态受控入口已实现以下边界；默认开发/兼容打包仍使用 Next，完整切换尚未完成：

```text
React renderer（esbuild 静态资源与页面导航）
  → 现有 HTTP/SSE 契约
    → 独立 Node Agent service（唯一业务组合入口）
      → AI SDK / DB / 文件与工具 / qkrpc / browser / terminal adapters
Electron shell → 窗口、preload/IPC、原生集成与所属服务进程的生命周期
```

| 边界 | 持有内容 | 不应持有 |
|---|---|---|
| Renderer | 会话展示、草稿、面板实例、输入与阅读状态 | 模型密钥、DB、Node/Next 服务端模块、工具执行 |
| Agent service | 配置与数据路径、DB owner、turn/权限、模型与工具、取消与资源释放 | Next cookies、页面路由和 React 组件 |
| HTTP adapter | 请求解析、请求身份/preview、Response/SSE 与断连信号 | 另一个 Agent loop 或另一套持久化 |
| Desktop shell | 窗口、系统能力、preload、启动/关闭所属服务 | 复制 Agent、会话数据库或工具策略 |
| qkrpc | V1/V2 宿主适配、CLI/MCP/HTTP、YAML codec/source bundle | 桌面 UI 与模型会话状态 |

先实现服务边界，再替换 UI 构建工具；已有 React、AI SDK、工具、YAML codec 与历史格式继续复用。
默认打包仍使用 Next standalone；`electron:prepare:static` 可生成不含 Next 的同构资源，完整切换须满足下述验收。当前也不是单进程系统：
Next/Agent、qkrpc、browser 与 terminal 已有各自进程，重构要统一 owner，不能再新增一套平行服务。

移除 Next 需要满足以下门槛；近期实现按 [产品主线](product/README.md#统一-rpc-与动作设计器当前主线)
优先搬入设计器，API 随其可运行竖切片分组迁移：

1. **切断框架依赖**：domain/application 与业务策略不导入 Next；cookies 留在 HTTP adapter。
   首个切片已将 release-preview 的 ALS 策略与 Next cookies 读取分开，支持无 Next 的并发测试。
2. **建立服务入口**：一个 composition root 绑定配置、DB 与工具，生命周期显式 start/stop；
   用生成 fixture 验证启动、SSE、审批回传、取消及重启，旧入口只是同一服务的适配器。
3. **迁移 API 领域组**：按 chat/history、settings、workspace/tools 分组保留原 HTTP/SSE 行为；
   每组通过兼容测试再切流量。任一时刻只允许一个 DB writer 与一个工具执行 owner。
4. **验证静态 renderer**：先迁主会话竖切片，再覆盖设置、Launcher、Designer embed、
   浏览器/终端、深浅主题；保留现有会话和审批，不同时更换协议或状态格式。
5. **替换桌面打包**：删除 Next server.js/tracing 专用启动分支前，验证原生模块、静态资源、
   独立用户资料、进程退出与升级。以实测启动时间、包体、内存与迭代耗时判断收益，不能凭框架名称宣称变快。

CI 独立推进上述检查，先保护现有可运行版本。R4 已开始的状态丢失修复收口后，R5 面板扩展与
更广 UI 拆分先等待服务边界，避免围绕旧宿主继续扩大改动。

独立 Node 入口现已提供 `dev:agent-service`：`/health` 不导入模型配置、不打开 DB；首个
`POST /api/chat` 才加载原 `runAgentChatTurn`。标准 AI SDK client transport 可完成工具执行、
审批回传与续跑，不新增 Agent loop、会话协议或数据库格式。Node 与静态 UI/Electron 入口
用于受控集成验证，默认开发和兼容打包继续使用 Next。显式 profile 与单 writer 已接入：`--data-dir` / `QUICKER_AGENT_DATA_DIR`
启动时固定资料根，Next 与 Node 共用 canonical SQLite lease，第二 writer 在迁移前拒绝；
生成资料与真实子进程覆盖竞争、崩溃和重开。旧二进制不遵守新租约，不能视为已受保护。
原 API handlers 已通过标准路由表接入 Node；静态 React、migrations/docs/skills、原生模块与
Electron 组合已有可执行入口。搬移目录后的 fake 模型/工具 API 与真实 Edge、browser/terminal
子进程退出验证，以及 Windows 隔离 packaged launch smoke 已通过。安装/升级、真实旧用户
资料和 P1–P3 完整宿主流程仍待集成；兼容 Next 入口因此保留。运行清单见
[静态运行目录](engineering/static-agent-runtime.md)。

服务停止先终止接收、取消各自请求并等待 response reader/producer 结束，再释放 runtime。
超过有界 grace 明确返回超时，仍保留 DB，待 `whenSettled()` 后延迟释放，不能一边关闭存储
一边让晚回调重新打开。runtime 清理只处理本进程实际登记并保有句柄的 browser/terminal
子进程；kill 失败或未确认退出时保留 owner/state 并报告失败，不能通过磁盘 PID 猜归属。
browser/terminal 的 stale listener/磁盘 PID 不再被作为终止授权；静态服务通过独立端口、
profile 内状态与 runtime owner 拒绝跨 profile 复用，IPC 断连停止所属服务和子进程。
浏览器工具 turn 取消现经 HTTP 连接传入 headless/embedded 的独立 operation owner。
同一 session 的队列保留实际 native promise 的尾，调用等待可提前取消，排队取消不分发；
原生等待后及共享 page/refMap 提交前再次检查 owner，禁止取消后的快照、预览和后续操作。
仅未发布的新建 context 属于该请求的清理范围；共享页面和 runtime 不因单次取消关闭。
已发出的 native 副作用不能撤销，永不 settle 的 native promise 仍会阻塞本 session；
这与服务进程回收、真实浏览器验收是不同边界，详见 [取消边界](browser-automation.md#取消边界)。

`check:agent-backend` 以内存编译检查本地依赖图，拒绝 Next 和残留本地 alias；npm 包保持
external。它不执行配置或模型，也不是发布打包器。开发服务使用进程级
`--conditions=react-server` 加载 `server-only` 的空入口；静态检查仅在自身后端编译中移除
该标记，Next 的客户端导入保护继续保留。真实 loopback/SDK 兼容回归由 `test:agent-service`
单独执行，模型与工具使用 fake；CLI probe 在隔离 profile、禁止出站网络下检查 lazy health
和真实生产绑定的未配置模型失败路径，SQLite 只写本次生成的 fixture。

外部依据：[AI SDK 后端支持](https://ai-sdk.dev/docs/getting-started#backend-framework-examples)
包含 Node HTTP 与其他服务端框架；[Electron 进程模型](https://www.electronjs.org/docs/latest/tutorial/process-model)
明确区分 main、renderer 与 Node 能力。这些说明技术可行性，不证明本项目已完成迁移。

### 统一宿主与动作编辑边界

已确认目标是同一 RPC 支持 V1/V2，优先复用 Quicker 新动作设计器，再研究通信效率。
下面是目标契约边界，当前状态/交付顺序统一见 [主线计划](product/README.md#统一-rpc-与动作设计器当前主线)。

```text
React renderer：Agent 工作台 + Quicker Designer 组件/文档 controller
  → Agent service：同一权限、编辑会话与动作应用端口
    → qkrpc Contracts / Runtime / 经身份核验的宿主会话
      → V1 adapter → Quicker V1
      → V2 adapter → Quicker V2
```

| 边界 | 契约与约束 |
|---|---|
| 宿主会话 | 发现候选后握手，返回稳定实例标识、本次 session、实例专属 endpoint、host kind/version、RPC/schema 版本和逐方法 capability；不能以端口可达、`ok` 或固定管道名代替身份 |
| 目标绑定 | 单个兼容实例自动选中；多个实例明确选择；动作读/校验/保存绑定同一 session。断连或重启后重新验证，不对写入跨宿主重试或 failover |
| 动作身份 | 复用 Quicker `ActionStorageIdentity` 的 catalog/draft、draftId/version 语义，并绑定 host session、action id 和预期编辑版本；GUID 本身不足以定位一个可写文档 |
| 文档编辑 | 复用 Designer 的 React workspace、history/present 与统一 snapshot 组装；一个 document controller 协调主程序、子程序、元数据、脏状态、撤销与保存。展示状态留在 renderer，不把整套编辑器状态搬进 Node |
| Agent 修改 | 通过同一动作应用端口与文档 revision 流程修改，不另建可覆盖 UI 草稿的写入通道；AI SDK loop、权限与工具注册表继续唯一。未打开设计器的 YAML bundle 流程继续保留 |
| 保存 | typed program body + storage identity + expected revision，由 adapter 处理原生版本差异、未知字段/baseline 和宿主持久化；校验、版本冲突、Designer 内存态、部分保存均返回明确结果 |
| 能力判定 | 按实际注入端口/操作声明并执行门禁；V2 source 或 Designer 未完成就返回结构化 unsupported，不能靠版本推断、空引用或假成功；UI 禁用与后端门禁一致 |

离线 codec 校验与 source dry-run 保持离线能力；其逻辑目标身份随文档保存，不要求为了
校验而连接运行中的宿主。实际写回时才重新核验目标 session、能力和预期版本。

`GetHostSessionAsync` 已将实际 host kind/version、协议/schema、bootstrap session 和动作
能力暴露到 RPC、CLI `ping --json` 与 HTTP `/health`。session 在同一次插件加载内稳定，
不等同于跨重启的实例 ID。旧插件仅在方法不存在时兼容返回未知身份，不按版本猜能力；
取消、断连和其它错误继续传播。两版本每次 bootstrap 现在启动当前用户命名空间内的专属 endpoint；固定管道仅兼容读取。
Transport 通过最多 64 个候选及共享握手时限核验身份，只自动选择唯一兼容候选；多候选需显式
session。每条连接在核验同一 instance/session/endpoint 后才允许写，server 端也要求本连接先握手。
`HostBinding` 保留已核验能力的不可变副本，source identity/checkpoint 同时保存该绑定；断线、重启、
能力不足或绑定不一致均不能切往其它宿主，写后断线返回 `WRITE_RESULT_UNKNOWN`。
CLI、MCP、serve 和 Agent 共用这一约束；Agent 在写前固定 turn 目标，源码保存先离线读取 bundle
绑定。pool 重连保留 session，catalog cache 按连接隔离，SSE 的独立连接也携带相同绑定和取消。
V1 安装/热更、专用 source 动作连续保存、冲突及 checkpoint 部分成功恢复已验证；
双宿主活进程和完整 Designer 流程继续按产品计划验收。
浏览器与服务端共用 `qkrpc-host-binding-contract.ts` 及 `action-project-binding.ts` 的纯身份
契约、解析和文档指纹；包含 ALS 的 `qkrpc-host-binding.ts` 仅保留服务端绑定职责和兼容导出。
Transport 沿用 instance/session/endpoint 比较；文档比较完整 binding。浏览器打包检查拒绝
Node/ALS/server-only 依赖。主动作的目标显示、本地读取与保存 CAS 也复用这两份契约。

旧 JSON 动作项目现在用 `.qkrpc/project-binding.json` 持久保存经过核验的完整宿主绑定与
动作 ID。CLI extract/export、MCP 和 Agent create 在文件写完后才提交此记录；apply、
serve 与 Agent Sync 在调用前交叉核验目录、info 和 sidecar，并固定该项目的宿主，不能
重新发现另一个实例。多个同 ID 项目不取首个；旧未绑定项目仍可本地编辑，但不自动补造
来源并向宿主同步。generic Write/StrReplace 也不能改写独立导出目录内的该记录。
C# 与 Node 通过同一 create-new 项目 lease 排除并发导出；绑定写入失败保留已落盘部分，
宿主 create 成功即记为已创建，本地 bootstrap 失败不能触发再次创建。
主动作通过本地 target API 读取实际 sidecar，晚加载只附加到既有 session，不清除草稿和历史。
完整记录进入不可变保存票据；普通 Save 在文档 owner 与同一项目 lease 内比较记录及正文/
属性基线，未加载、改绑、删除或损坏的身份不能覆盖文件。unbound null 是显式本地状态。
Sync 传递精确目录与预期记录；CLI 的逐子进程环境和 HTTP args 保留 omitted/null/record
区别，持久 serve 不继承其它请求的预期身份。apply、validate、extract 和 set-metadata
在各自 lease 内再比较完整原始记录，包含能力与保留的未知 host 字段；属性失配不重发正文。
结构化错误和已持久化部分跨 API 保留，缓存、事件及 busy 回执按文档 generation 与完整目标
隔离。设计器的七组 catalog HTTP 入口复用纯 `DesignerCatalogContext`，每次请求创建独立
execution state，以项目目录和完整绑定在 RPC 前后核验目标，并将请求取消传入现有
transport。主文档 loading/unbound 不发现宿主、不发 RPC；绑定失败不降级为静态结果。
文档拥有 `DesignerCatalogPort`，嵌套 surface 共享它；完整目标、cwd 和文档 owner 隔离
缓存及迟到结果。共用加载按 waiter 计数取消，单个消费者退出不取消其它消费者；端口关闭
才释放其余所属请求。旧独立入口不携带 context 时保留兼容调用，不能用于主文档回退。
多宿主选择、完整资源目录、trace run owner 与 Agent/UI 共享实时 revision 仍待接线；
完整新版 Designer 和 V2 原生存储身份不能由这一层持久来源约束替代。
V1 native source 与保存保护已实现；V2 有旧 body/patch，保存前必须明确确认 Designer
未打开，查不到状态返回 `DESIGNER_STATE_UNAVAILABLE`，打开则 `DESIGNER_OPEN`，不继续
持久化。V2 已有 `IQuickerRpcActionProgramSourceHost` 的原生 catalog/draft adapter，复用
共享 codec，保留未知字段、snapshot hash 与条件持久化；宿主原生 API 或 UI dispatcher
不具备时 capability 关闭。V2 真实目标绑定/专用动作验收仍待完成，这与 V2 Designer UI port
为 null 是两个不同边界。端口逐项对齐见 [V2 计划](design/quicker-rpc-plugin-v2.md)。

设计器来源是 Quicker 的 `QuickerPc/Quicker.Headless/Web/src/`：
`pages/ActionDesignerEditorPane.tsx` / `ActionDesignerPage.tsx` 组合 workspace，
`features/program/ProgramEditorTabWorkspace.tsx` 与 `XProgramEditor` 负责程序编辑。
`ActiveXProgramBridgeProvider` 与 `assembleActionProgramSnapshot` 已有多 surface 编辑与
保存组装路径。迁移应抽 host ports、复用这些业务路径，不在 qkrpc 再写一套步骤编辑器。
原 `designerHostGrpcApi`、session hub/events、资源与运行/调试调用分别接 adapter；
WebView/HTTP/SignalR 的宿主接线不直接进入可复用组件。

其中 `designerProtoServiceClient.ts` 当前把 proto service 映射为 JSON Bridge 方法，
`hostClient.ts` 已有 `installHostTransport` 注入入口，可用于接独立服务；不能因文件名含
gRPC 就推断线上已是二进制 gRPC。现有 timeline 的防抖快照与 C# snapshot store 只维护
client/surface 的 latest slot，部分 mutation snapshot 不含子程序；它们不能直接充当完整文档
事务 owner。迁移须补齐完整文档 revision 与 UI/Agent 并发协议，保留子程序与全部未保存内容。

来源 Designer 的 ResourcePane 是动作/子程序/模块 catalog；YAML bundle 的外置脚本、
默认值文件和 `files/` 是另一类资源。迁移须同时保留 qkrpc 已有 `programWire` / 文件内容
adapter，分别验收 catalog 拖放与外置文件保真往返。typed/proto 是编辑契约，不替代原生
baseline；不能从生成模型的 `toJSON` 重建整个 V1 动作并丢弃未知字段。

首轮迁移已经接入既有 `ActionProjectDataEditor`：`ProgramEditorTabWorkspace` 为每个
文档创建独立 live-editor bridge，主程序与递归嵌入子程序保留已访问的编辑器和历史，
只有可见且拥有焦点的 surface 处理快捷键。`assembleActionProgramSnapshot` 从当前
handle 读取所有编辑内容，关闭子程序页签或切源码不会丢弃草稿。
`lib/action-editor/document/` 的 controller 管理完整原生文档、局部 revision、身份和
保存票据。保存只推进对应票据的基线，晚回执不会把其后的草稿标成已保存；外部文件
变更会保留本地草稿并阻止覆盖。纯 controller 已有 Agent 事务入口，但实际 Agent 工具
尚未接入打开的 UI session。当前磁盘会话没有伪造宿主身份。
纯文档 session 现在持有有界的完整正文/可编辑属性历史，`transactDocument` 将递归子程序、
正文和已支持的三项属性作为一笔同步事务。undo/redo 核验当前完整身份与 revision，产生新
revision；只恢复正文原文和可编辑属性，不回退宿主版本、来源绑定或未知 metadata 字段。
保存和部分/迟到确认只推进对应基线，不清除历史；接受的外部属性变化按字段重置其历史值。
此处仍是纯层接口。现有 surface 按钮与快捷键尚未切到它，后续接线必须移除第二条时间线，
再开放子程序属性及重命名，不能将两套 undo 并列使用。
原生未知字段与外置文件引用在 projection overlay 及实际 `writeWorkspaceFile` 的磁盘
规范化链中保留；后续 host adapter 仍须加入存储版本/CAS，这不等于已实现宿主事务。

协议语义优先参考 Quicker `Designer/Protos/designer_host.proto` 中的 edit session、
typed `ActionProgramBody`、`ActionStorageIdentity` 与 expected edit version；已有 catalog
snapshot/etag 先复用。先保持当前请求/响应与聊天 SSE，测量 catalog 首次加载/复用、大动作
载入、连续编辑与大资源的字节、耗时、内存和取消，再选择缓存、批量、增量或编码优化。
传输更换不得改变动作身份、事务/revision、错误、背压与取消语义。

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

`turn-lifecycle.ts` 持有每轮独立的取消信号和资源释放。HTTP `Request.signal` 和最终 SSE
响应体取消均传到该 owner，再传入模型、摘要压缩、工具执行上下文与子代理。嵌套 cwd
兼容入口保留父信号。取消必须抛出原原因，不能当成断连而改走 CLI、重试或启动新模型。
会话可见性只控制输入与展示，切换会话不会取消后台 turn。

`TurnExecutionState` 保存创建/编辑/patch 标记、计数和连接阻断事实。root turn 创建新对象，
嵌套工具与子代理传播同一引用；thread id 仅用于历史和资源命名，不能作为可变执行状态的索引。
生命周期释放会清空并关闭该对象；仍持有旧上下文的晚到回调不能重新写入已关闭状态。

正常生产结束时释放 runtime，但仍允许响应体排空已缓冲的消息；响应体结束后解除父信号监听。
初始化过程中晚到的资源也必须释放。压缩重试先取消被拒收的模型 attempt，再释放 reader，
避免 AI SDK tee 分支互等；每个 attempt 使用派生信号，不取消整轮请求。

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
| `TurnPlan` | intent、risk、target、相关工具与验证建议；不等于权限已执行或验证已完成 | 每 turn 一份 |
| `ToolExecutionContext` | cwd、scope、thread、bench 等执行上下文 | 每 turn 一份 |
| `TurnExecutionState` | 本轮工具共享的可变执行事实与关闭状态，不跨轮保存 | root turn 创建，嵌套调用共享引用 |
| `PreparedAgentTurnRuntime` | 交给 Agent loop 的完整运行参数 | stream 前生成 |
| `AgentRuntimeSnapshot` | 供 UI/评测观察的只读快照 | 输出 metadata |

DTO、Domain 值对象和外部 SDK 类型必须分开命名。禁止用可选字段不断扩张一个“万能
context”。

## 6. 工具规范

每个工具能力逻辑上分为五部分：

1. `catalog`：稳定 id、用途、风险和 capability bundle；
2. `selection`：模式、用户选择、命令限制与父权限取交集，`TurnPlan` 提供相关性建议；
3. `model schema`：给模型的 description/input schema，可按需瘦身；
4. `execute`：只执行能力，通过显式 context 访问宿主；
5. `presentation`：把原始结果转换为 model view 和 UI view。

执行函数不得同时承担工具选择或 UI 渲染。工具失败应返回结构化错误和可执行的
`nextAction`；仅真正的基础设施异常才抛出异常。

对应实现：

| 策略 | 权威入口 | 不变量 |
|---|---|---|
| 静态目录 | `tool-registry.ts` + `agent-tool-catalog.ts` | id 唯一；目录与可执行定义一一对应；description/schema 非空 |
| 权限交集 | `chat-tool-selection.ts`、`agent-defs/tool-restrictions.ts` | `undefined` 表示未限制，显式空集合不能恢复默认能力；合并 MCP 后再次应用命令限制 |
| 模式执行门禁 | `agent-tool-mode-guard.ts`、`agent-mcp/tool-capabilities.ts` | Ask 的混合工具按操作拒绝写入；MCP 仅开放显式只读且非 destructive 的定义；当前 browser 不进入 Ask |
| 子代理能力 | `task-tool-capabilities.ts`、`task-tool.server.ts` | 只继承父最终工具集的子集，保留同一预算/门禁闭包；不含 task；未绑定父 runtime 时拒绝执行 |
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
pnpm check:agent-offline
pnpm test:agent-eval
pnpm test:context-compression
```

`check:agent-offline` 顺序执行无输出类型检查和显式测试清单；测试进程安装 fetch/HTTP/TCP/TLS/UDP
误调用防护，使意外的真实网络调用失败。这是可审查测试的防护网，不是操作系统沙箱。
清单使用 fake SDK model、fake HTTP、生成的 DB fixture 和本次创建的子进程，不能自动读取
用户旧数据库或调用真实 Quicker/模型。它覆盖当前重构切片，不替代所有业务验收。
`agent-eval`（无 `test:`）、Electron launch/full smoke 和真实宿主动作测试不属于离线入口。

Electron smoke 的 `verify` 只检查包产物；`launch/full` 仍须明确执行，并要求包内包含新的隔离握手。
每次启动在仓库 `.tmp/electron-smoke/run-*` 创建独立 profile、AppData、HOME、临时目录和工作区，
在加载应用模块前设置 Electron userData/sessionData。Windows Job Object 在恢复根进程前接管它，
结束、取消或根进程早退只释放这个 job；不按名称停止应用，也不扫描或复用已有服务。
脚本先核验 runId、profile、job 内 PID 与精确监听端口，再探测本轮 UI 并允许窗口加载。
该 smoke 的 RPC 端口由本轮进程拥有，明确 `hostRpcDisabled=true`，拒绝所有调用；不验收真实
Quicker 插件、动作读写或模型请求。旧包缺协议时先拒绝启动，需重新构建匹配的包。
离线验证为 `node --test agent-gui/electron/smoke-isolation.test.mjs agent-gui/electron/backend-smoke.test.mjs` 与
`pwsh -NoProfile -File agent-gui/scripts/Test-QuickerAgentElectronSmokeIsolation.ps1`；只用 fake app、
socket、spawn、job/监听快照和生成目录。原生 Job Object 执行、打包 Electron 与实际窗口仍须单独验收，
本轮未执行；测试日志和资料目录保留在对应 run 目录中供核对。

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
