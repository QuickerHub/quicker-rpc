# QuickerAgent 架构规范

> 状态：当前权威架构文档。代码行为以测试和实现为准；本文定义模块边界与依赖方向。

QuickerAgent 的默认生产入口使用静态 React、独立 Node service 与薄 Electron 壳；
TypeScript 与 Vercel AI SDK 继续复用，Next.js 只用于开发 HMR 和显式 legacy。AI SDK
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
| Node service | `lib/agent-service/`、`service/main.ts` | 默认生产 loopback HTTP、背压与断连、懒 runtime、原 API handlers 与静态 React |
| Application | `lib/agent-harness/turn-runner.ts` | 通过注入的端口串联 turn 阶段，持有一次请求的取消与资源 owner |
| Server bindings | `lib/agent-harness/run-turn.server.ts` | 将配置、scope、工具和 usage 等真实服务绑定到应用层 |
| Request | `lib/agent-harness/turn-request.server.ts` | 模式、slash、消息修复、LLM selection 标准化 |
| Runtime preparation | `lib/agent-harness/turn-runtime.server.ts` | scope、tools/Skills/MCP、TurnPlan、调用策略、prompt、context budget |
| Agent loop | `lib/agent-harness/stream-loop.ts` | `ToolLoopAgent`、step hook、stream metadata、压缩重试；`.server.ts` 绑定持久化与压缩端口 |
| Domain | `lib/agent-core/`、`agent-recovery-policy.ts` | 无 IO 的决策与值对象 |
| Tool adapters | `lib/tools.ts` 及各 `*-tool.server.ts` | 调用外部能力并返回统一结果 |

### 框架去耦与目标运行边界

Next.js 保留为开发和显式 legacy 的 HTTP/UI 宿主。主页面只组合客户端
Chat、启动占位和 Designer URL 参数；现有 API handlers 承担本地服务入口。`/api/chat`
已经只做 Request 解码与应用层绑定，runner/loop 使用 AI SDK 和标准 Response/SSE。
SQLite、文件、子进程、ALS 和 stdio MCP 需要 Node.js，不能据此推导出需要 Next.js。

默认生产 build/start、Electron prepare 和发布入口已实现以下边界；开发 HMR 保留 Next，
删除显式 legacy 分支仍须满足后述完整验收：

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
默认 `electron:prepare` 构建不含 Next 的静态资源和独立 Node service；显式
`electron:prepare:legacy-next` 才暂存 Next standalone。当前 shell metadata 与资源 mode
marker 不一致、静态 manifest 或必需入口缺失时，在桌面命令服务和 backend child 启动前
失败；残留 `server.js` 不能使 static 自动降级。mode 不证明产物新鲜或升级事务完整。
Agent、qkrpc、browser 与 terminal 仍有各自进程与 owner，不新增平行服务。

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

CI 独立推进上述检查，先保护现有可运行版本。R5 文件实例现已在客户端与呈现解耦，
复用同一 Node/Next API；更广面板契约继续按实际生命周期逐项接入。

独立 Node 入口现已提供 `dev:agent-service`：`/health` 不导入模型配置、不打开 DB；首个
`POST /api/chat` 才加载原 `runAgentChatTurn`。标准 AI SDK client transport 可完成工具执行、
审批回传与续跑，不新增 Agent loop、会话协议或数据库格式。Node 与静态 UI/Electron 是
默认生产路径，Next 仅为开发 HMR 与显式 legacy。`pnpm start` 在原 Node 进程内导入服务，
生产模式固定，参数与显式 profile 继续使用 `--data-dir` / `QUICKER_AGENT_DATA_DIR`；
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

<a id="knowledge-acquisition"></a>
### Knowledge 获取与更新

用户于 2026-10-24 明确：核心是可更新的 knowledge 获取架构，不能把某个 Quicker
版本的字段、模块或反编译结果固化成长期知识。Agent 与 Designer 复用同一来源，按用途
取得压缩 schema 或 UI 投影；知识内容不授予工具权限，也不代替写入前的原生校验。

```text
已连接宿主 / MCP 自描述 / 当前 codec
  → provider：能力发现、实际读取、来源与内容指纹
    → knowledge 目录与查询：按来源、身份、格式及 revision 核验
      → Agent schema / Designer UI / 文档与示例投影
```

- **发现**：按当前连接的 capability、工具/schema 和格式声明选 provider；版本是来源标识，
  不用版本号分支猜字段。原生定义、MCP tools/list、codec 合同、公开文档和内置指南有各自来源。
- **原生事实**：模块键、输入输出、控制值与链接从当前宿主读取。缺失或新格式明确 unknown，
  不把内置示例、旧消息、UI schema 或某次二进制探针当作当前事实。
- **来源与格式**：保留 host/session、宿主及 adapter 版本、schema 格式与内容指纹、读取时间。
  内容指纹标识已读取的内容；它本身不能证明 provider 此刻仍提供同一版本。
- **更新**：重连、目标/session、capability、schema revision 或 MCP 工具目录变化使旧结果失效。
  只有重新核验 provider revision 后才能复用缓存；没有该入口时重新读取。对话 ID、模块名或
  TTL 单独都不能证明新鲜。迟到结果不能替换新 owner 的知识，也不能撤销已确认的失败。
- **回退**：codec 文档来自本工具实际支持的格式，内置指南明确包版本及指纹；网站正文保留
  URL/抓取时间。回退与当前原生定义冲突时保留冲突并查询来源，不静默覆盖或补造支持。
- **消费**：保持单一 AI SDK loop、现有工具预算与权限。Agent 使用压缩 schema；Designer
  使用 UI 投影；实时输入写入仍重新取得私有原生契约，不能凭 knowledge 缓存扩大可写范围。

首个后端增量沿用 `step-runner get` 的 `SchemaJson.knowledge`，避免新增平行工具/存储：
`schemaVersion=1`；`source` 描述 provider、来源 kind、host/adapter 及会话；`schema` 描述
格式与 `sha256:` 内容 revision；`requestedControlFieldValue` 区分 null（未提供）和空值；
另保留 `retrievedAt`、`nativeHelpLink` 及标为 bundled-fallback 的指南引用。
`runtime-definition`、`bundled-adapter` 和 `unknown` 是不同来源，均不等同于写权限；
缺少来源的旧插件结果保持 unknown，不用客户端时间补成原生读取证明。

Agent 输出因预算省略旧格式 `schemaJson` 时，继续保留实际返回的 knowledge 和参数名，
完整原始输出留在 `displayData` 供查看。该摘要不是编辑合同；不得补造 provenance，或因
持有来源与指纹就推断被省略的默认值、类型、约束与写权限。

迁移首片先移除按 thread/key 无限复用的模块结果，以及按固定技能组合阻断重新发现的规则。
后续接 native provenance/fresh reader、统一查询与失效、codec/文档来源和升级场景验收。
相同模块更新字段、同宿主更新定义、换会话、先空后有、来源不可用及旧查询晚到分别验证。
实施状态统一维护在[产品计划](product/README.md#refactor-execution-plan)，不以移除一层缓存
或定义一个 provider 接口作为整项完成。

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
绑定。pool 重连保留 session，SSE 的独立连接也携带相同绑定和取消。Console 的 StepRunner
搜索、Agent schema 与 UI schema 每次重新调用当前绑定的 RPC；连接身份不能证明模块定义
未变，没有当前 revision 重验时不复用已完成结果。控制值在解析后保持原始 null/字符串，
不合并空串、空白或大小写；其它命令的参数解析约定不变。
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
FA geometry 复用同一 port、lease 与目标核验；Provider presence 与 unresolved port 分开，
有文档上下文时标题/步骤预取/portal 不进入全局 FA hook、持久缓存或无绑定 resolve。
主动作 APDE 的外层 Provider 覆盖标题与属性，嵌套 surface 保持同 owner；未提供局部 port
的 Workspace 继承外层 presence，不制造新的 loading 状态。其它无 Provider 的旧入口
保留原全局图标兼容行为；全局缓存改为实际使用时才加载，导入模块不会读取用户存储。
FA 分页仅接受完整文档绑定，复用原 catalog port、项目 lease 和 RPC 前后核验，不借用
旧入口的默认宿主。纯 helper 归一 query/style/window 并校验 names、query、style、skip、
take、totalCount、hasMore；旧搜索/resolve 不变。分页与其它 catalog 共享 256 项 LRU
及按 waiter 取消的 pending 请求。CLI/serve 使用 page 专用 JSON 输出保留 null style，
不改变全局省略策略或放松前端事实校验。
共享图标选择器消费同一文档 port，首次/后续页的 geometry 按已有批次获取，选色仅本地
投影。每次打开拥有草稿和请求；隐藏即取消 waiter，旧结果不能发布。Regular/Brands
组合页保留两类完整 total，翻页错误停止 observer 自动请求，显式重试成功才清除错误。
属性选择分别进入现有文档事务或属性草稿，不新增 Session/history。既有 workspace
投影可见性与键盘 owner，颜色 portal 在 layout 阶段释放全局监听，不抢下一文档输入。
`ensureParamValue` 的纯值转换与参数 UI 分离，catalog/draft helpers 不再为该函数导入整条
参数编辑器及图标组件；这只关闭该处依赖边界，不表示其它混层已全部清理。
主动作备注编辑已接入 Agent/UI 的同一实时 revision；多宿主选择、完整资源操作与更广编辑仍待接线。
完整新版 Designer 和 V2 原生存储身份不能由这一层持久来源约束替代。
V1 native source 与保存保护已实现；V2 有旧 body/patch，保存前必须明确确认 Designer
未打开，查不到状态返回 `DESIGNER_STATE_UNAVAILABLE`，打开则 `DESIGNER_OPEN`，不继续
持久化。V2 已有 `IQuickerRpcActionProgramSourceHost` 的原生 catalog/draft adapter，复用
共享 codec，保留未知字段、snapshot hash 与条件持久化；宿主原生 API 或 UI dispatcher
不具备时 capability 关闭。V2 真实目标绑定/专用动作验收仍待完成，这与 V2 Designer UI
capability 关闭是两个不同边界。只读 Designer port 不开放 UI 操作；端口逐项对齐见
[V2 计划](design/quicker-rpc-plugin-v2.md)。

V2 的 StepRunner UI 详情与 Agent 详情共用 catalog mapper，分别使用完整 UI 与压缩
Agent serializer。只读摘要调用精确 native leaf，并在现有 Application dispatcher 上
执行；不为目录读取初始化整个 Headless/Agent/账号栈。取消的迟到结果不交付，缺失
Designer 的十个 Runtime 入口使用现有结果 DTO 明确失败，不能换宿主或空引用。
这两项原语不开放 DesignerUi capability，也不代表完整 V2 Designer 已接入。
quick insert、toolbox 与 FA geometry 另由可选读 availability 和独立 wire key 声明。
每个 V2 host 保有自己的 native catalog snapshot，只使用精确只读 leaf 和当前 dispatcher；
旧 FA search、编辑器、context、剪贴板与 text tool 继续明确不支持。能力探测仅检查已加载
类型，不以初始化 Headless/账号栈换取 capability=true。

图标完整分页另用可选 `IQuickerRpcDesignerFontAwesomePageHost` 与独立能力
`designer.fontAwesome.page.read`。V1 在自己的原生全 enum 上复用来源的中英文评分和分页；
V2 绑定精确 native SearchPage/七字段 DTO，经既有 dispatcher 调用并检查页事实及取消。
该端口保留完整筛选总数，不改变旧 maxResults/expand 搜索；Node adapter/完整选择器继续迁移。
通用 `QuickerV2Runtime.ResolveType` 会补载 satellite，读取探测因此改用独立的精确已加载
程序集查找，覆盖 quick insert、toolbox、geometry 和 page；缺少类型或 dispatcher 时不可用。

动作与全局子程序的完整摘要分页使用 root host 的可选
`IQuickerRpcResourceCatalogPageHost`，分别声明 `resource.action.page.read` 与
`resource.globalSubprogram.page.read`，独立于 DesignerUi。CLI 为
`action/subprogram catalog-page`，HTTP 为 `resource.catalog.page`。scope 固定
`runtimeCatalog`：V1 已加载 profile 中的动作与内存全局子程序，排除 SQL 孤儿行、
未保存 Designer 草稿和云端未加载项目。摘要保留原始标题、说明、图标、字符串 editVersion，
不求值标题/图标表达式，不读取正文，不触发搜索、索引构建或持久化。

V1 仅为已加载且 MVID 匹配的 Quicker/Quicker.Common 开放能力；未知构建或 metadata
不足时关闭。首个 native 静态字段读取前，只从已存在的 exact Quicker.App 实例读取
启动标记字段，要求其为已记录启动位置的 BCL List，避免目录读取触发 AppState 首次初始化。
capture 在真实 Application dispatcher 的同步段内用原生同步锁 TryEnter(0)，拒绝同线程重入，核验
loaded、退出账号标记、固定账号及服务/锁引用前后未变，再复制标量；忙、退出、缺少状态、
枚举异常均失败。独立 hosted observer 只用 Interlocked 记录原生同步消息，不能当作
原生账号 epoch；Stop 先失效 owner 再退订，同一组件再次 Start 使用新 owner。分页身份
共用 Runtime 的 host/session，加上 owner、匿名账号范围、观察 revision、全部摘要和筛选。
后续页必须带首屏 snapshotId；变化时明确 CATALOG_CHANGED，不拼接两个快照。V2 该可选
端口暂未接入，两项能力为 false。离线 DI、dispatcher、CLI/HTTP 回归已具备；本机 169
V1 实测分页读完 467 个动作、336 个全局子程序，错误快照明确拒绝，未写正文或运行动作。
设计器 ResourcePane 已通过绑定项目的标准 API 消费该端口，两类能力分别检查。页面不作
持久缓存；隐藏或换目标取消请求，目录过期时保留旧摘要并停止拼接，显式刷新重建首屏。
资源选择只展示摘要，不改写 Session。已知 XAction 组合动作的「在工作区打开」使用独立的手动本地导出
API，额外核验 V1 `action.legacyBody.read` 与原项目完整绑定，不把目录能力当作正文权限。
本地项目按 actionId 与完整目标唯一匹配；已有项目不重导出，新导出只写原子新建的空目录，
继续调用已有 `action.extract --no-bootstrap`，不新增宿主写入或 Agent 工具通道。
requestId 的不可变 claim 放在导出目录外，绑定 cwd、现有文件 owner、来源项目及完整目标；
重复 ID、部分目录或未知收据不重派发。派发后完成归独立有界生命周期，取消与来源变化
保留已确认本地持久化事实。排队请求遇到前置未知/部分结果只返回自身未派发，并显式关联
原请求及其本地收据；不冒认其目录、不生成新 claim 或输出目录。canonical workspace 保留
大小写实体区分。相同 UUID 重查唯一已有项目仍只读成功，不因没有导出目录而报未知。
工作台 presentation ticket 只在原 owner 仍可见时打开返回路径；
已有文件实例仅 focus，不 force reload、重建 Session 或清除历史。169 已通过真实 HTTP
验收已有项目复用、同 UUID 重查和错误 owner 拒绝，源文件与外部文件 hash 未变，未执行
动作；新 UI API 的首次导出和 native GUI 点击仍待验收。

V1 全局子程序调用复用同一模块插入 registry、`prepareToolboxStep`、参数弹窗和文档 controller。
映射来源为上游 ResourceExplorer 与 SubProgramStepV2 的 `sys:subprogram` / `subProgram`；
按 catalog 原生 resourceId 读 IO、原样保存 callIdentifier，不拼接标识或猜参数名。所选 UI
schema 必须证实该输入定义；IO 失败不能确认。IO 使用原 bound raw `subprogram.get`，
不走 MCP workspace augmentation/ensure-local/export，并显式禁止 CLI bootstrap。
拖放携带当前 document/surface、完整 catalog key 与可见 owner 票据；晚 schema、隐藏或
换目标不能提交。提交前 flush 表单，从当前 controller 快照插入；新建变量先暂存在该表单，
确认时与调用一起单事务提交，取消不插入调用或新变量，已有变量发生变化时保留草稿拒绝覆盖。
fixture/真实 DOM 已覆盖参数、撤销、嵌套拖放和晚响应；本调用链的 V1 原生实机仍待验收。
V2/子程序打开写回、动作引用插入/拖放与更完整编辑操作仍待迁移。

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
变更会保留本地草稿并阻止覆盖。实际 Agent 的主动作备注首片已使用同一 controller；
当前磁盘会话没有伪造宿主身份。

`WorkspaceDocumentHost` 持有 live registry，注册原 APDE endpoint，不复制正文 Session。
真实主程序“+对话”产生私有 pin；manual turn 固定原 thread、用户消息、cwd、owner、
session 及完整 identity，并 flush 人工草稿后取 scope。聊天历史和标签文本不重新授予 scope。
同一文档的本轮 pin 可组合；多文档、过期 pin 和目标缺失明确不可用，不回退磁盘或默认宿主。
`workspace_program` 在该 scope 下替换为 AI SDK 客户端工具：`read_live` 返回完整当前正文、
revision 和 dirty；`edit_live` 修改已授权唯一 stepId 的备注，并核验 readOperationId、
expectedRevision、scopeId 及当前 owner。它走原 controller 的单次 Agent 事务，回执明确
`persisted=false`；切换可见文件不改变原目标，文档关闭、身份变化或 Sync busy 时拒绝修改。

客户端工具继续使用现有 SDK 的 addToolOutput 和自动续轮，不创建第二套 Agent loop。
自动续轮沿用 manual turn 的 cwd、模式和工具选择；同名工具必须原本在最终选择集中，
Ask 只有 read_live，嵌套 task 不获得该客户端端口。live scope 不提供 Shell、宿主写入、
磁盘动作编辑或外部 MCP；既有工具调用预算和权限继续统一约束。
真实 toolCallId 作为 operationId 保存已应用事实，同一请求不重复提交，改变参数则拒绝。
停止既阻止修改与模型续轮，也在流排空后收口迟到 pending；已应用事实优先恢复为成功回执。
SDK setter 即使接收原数组也会通知，idle repair 只在消息确实改变时发布，避免反馈循环。
历史恢复仅展示回执，不执行工具。当前 UI pin 只开放主程序 surface，更广文档编辑与保存/
Sync 协同仍未完成；纯层递归步骤支持不等于嵌套页签 UI 已开放。

参数契约通过可选 `IQuickerRpcStepRunnerInputContractHost` 读取实际模块定义；能力标记为
`stepRunner.inputContract.read`。Contracts 独立保存原生类型、变量模式、自由输入、控制字段、
可见性及字面值限制，不复用有损压缩的 Agent schema。未知事实保留未知；当前契约未证明的
可见表达式或操作成员关系不能授权编辑。CLI/MCP/HTTP 共用 Runtime，读取不启动宿主，
文档 HTTP 在请求前后核验完整绑定；空控制值与省略控制值分别保留。

`applyProgramDocumentStepInputs` 只负责同一 Session 的既有输入批量事务与保真，不自行推断
schema 或授予权限。客户端 `read_live(stepSchemaFor)` 在同一 scope 的私有 ledger 保存
实际 contract 与 revision，读取前后 flush 并复核完整身份、正文及 busy 状态；原始控制值
不同于原生默认时重新向同一端口读取，变量/文件/动态控制值不借用默认值。请求按实际
operationId 去重，进入 pending 前同步预留有界回执名额；取消一个 observer 不取消其它
observer，关闭 scope 则中断全部等待。

原 UI handle 同步报告各保留 surface 的确认弹窗及工作区属性/删除/图标弹窗状态，endpoint
在 flush、读取、metadata 等待前后及同步修改前核验。忙碌返回 `LIVE_DOCUMENT_BUSY`，保留
原 target 与失败回执，不自动提交确认草稿；普通字段继续使用既有 compact-form flusher。

`edit_step_inputs_live` 从私有记录和当前原文重新证明可编辑键、模式、可见性与封闭选项，
再同步调用原 controller 的单次事务；提交和回执间不 await。原生 `$=`/`$$` 有求值语义，
物理 wire 转义不等于普通文本；当前普通值操作保守拒绝美元符号及格式字符，不覆盖变量/
文件/控制字段或动态值。原生文本类型转换与执行诊断仍待接入，不能将成功编辑当作执行
成功。SDK callback 只等待 metadata，发布 addToolOutput 时不等待其续轮；跨轮晚回执不
ACK 当前消息，停止后的已提交事实仍可用于历史修复。完整参数模式与 Save/Sync 继续迁移。

运行时依赖边界由 `scripts/check-designer-document-dependencies.mjs` 检查：递归编译所有
文档生产入口的传递依赖，不执行产物，拒绝 UI/server 模块与资源、framework directive 及未经允许的
外部运行时依赖。纯 protobuf wire 是当前显式例外；type-only 引用由编译器擦除。该检查
不审计动态计算的导入、全局 API 或外部包内部，不能代替事务和真实集成验收。

纯文档 session 现在持有有界的完整正文/可编辑属性历史，`transactDocument` 将递归子程序、
正文和已支持的三项属性作为一笔同步事务。undo/redo 核验当前完整身份与 revision，产生新
revision；只恢复正文原文和可编辑属性，不回退宿主版本、来源绑定或未知 metadata 字段。
保存和部分/迟到确认只推进对应基线，不清除历史；接受的外部属性变化按字段重置其历史值。
`programDocumentEditorController` 已将 APDE 的主/嵌套 surface 接到同一 session。受控 X 编辑器
不分配 present/past/future，只从 controller 即时读取并提交；Workspace 不再保留 initial
payload、live snapshot 或 overrides。文档级按钮/快捷键和 portal 归属复用同一 owner；
普通输入保持原生 undo，步骤/变量的延迟草稿在文档 undo/save 前同步 flush。保存只读取
该 session，source 切换和晚确认不重建历史。独立 X 入口继续使用原本的本地历史。

`applyProgramDocumentSubProgramProperties` 在同一 `session.transact` 内修改内部子程序
属性及所有可证实的内部字面调用，沿用完整身份/revision 与历史。它操作保真 raw 文档，
不由 typed projection 重建正文；动态绑定、未知表达式和外部 link/template 缓存保持原文。
名称需遵循来源设计器的 trim/重名/保留前缀规则，歧义 ID 或 wire aliases 拒绝整个事务。
表达式前缀名称只编码成固定字符串常量，连续改名仅解码自身规范形式，不求值用户表达式。
内部子程序属性弹窗已通过 Workspace 双击和上下文菜单接入该入口。打开及应用前同步
flush 编辑草稿，应用时重新读取 revision，并核验打开时的完整身份和原属性；失配保留
弹窗草稿。portal 复用文档 keyboard owner，隐藏时保留状态，关闭恢复当前页签焦点。
属性确认及字面重命名共用原 Session 时间线；完整图标选择器仍须继续迁移。
创建与删除也只操作这份 raw 文档：`createProgramDocumentSubProgram` 接调用方 ID 并
追加根定义；`prepareProgramDocumentSubProgramDelete` 给出原 Session 所属预览，提交
必须仍是同一完整身份、revision 和目标指纹。删除会重新扫描原生存储调用及文本窗口
`$sp$` 引用，拒绝仍被使用的定义；动态表达式保持不求值的边界，不冒充完整静态分析。
foreign 缓存仅参与保守引用检查，不能作为可编辑目标。每次成功提交只占一个原历史项，
迟到保存只推进原票据基线。纯层已验证，创建/删除的界面确认与页签接线仍待迁移。
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
| `components/chat/useAgentChatSession.ts` | 持有唯一 AI SDK 会话、消息、transport、live manual turn 与历史保存；接客户端工具及停止后的条件收口 |
| `components/chat/useChatMessageEditing.ts` | 持有单会话历史消息编辑锚点/草稿、确认与全局监听归属；输入正文继续由 composer 持有 |
| `components/workspace/WorkspaceDocumentHost.tsx`、`lib/workspace-document-instances.ts` | 工作台文件实例与当前 Chat outlet 分开，固定存储/呈现 ports，编辑 Session 仍由 APDE 独占 |
| `lib/agent-workbench-features.ts` | 声明快捷入口的稳定 id、文案、panel/command/route 目标及可用条件 |
| `components/chat/ComposerShortcutCards.tsx` | 将功能定义绑定到已有图标、面板 hook、命令和路由 |
| `app/theme.css`、`app/agent-workbench.css` | 主题根节点统一黑白灰通用 token（包含 body portal）；`.agent-workbench` 限定主工作台布局尺寸 |

框架组件为纯展示组合，不启动 Agent、不持久化会话、不注册模型工具。保留现有分栏 DOM 与 refs，拖动、消息滚动和面板状态继续由原有组件负责。功能定义是界面入口目录；运行时工具目录与策略仍由 `TurnPlan` 和工具层负责。

消息滚动的动画帧由 `use-messages-stick-scroll.ts` 的当前 thread/可见生命周期持有，
`message-scroll-frame-owner.ts` 统一取消手动 pin、激活对齐、监听器安装和流式 prompt 的
二段回调。隐藏、切 thread 或卸载先关闭 owner；即使浏览器已经捕获回调批次，也不能再
安装监听器或移动旧滚动容器。同一 thread 的布局更新额外取消上次 prompt 的第二帧，
不影响另一个会话的帧，也不改变既有前台跟随策略。

工作台文件实例由 Explorer provider 的私有 registry 持有，以 cwd、tab ID 与实例代次
标识；它只保存 owner、基线描述与读请求 token，不存第二份编辑 present/history。
所有 ChatPanel 外有唯一 `WorkspaceDocumentHost`，其 portal target 保持不变，切换时仅
将 DOM 容器移到当前 outlet。APDE 自己的 Session、票据与历史原位保留；隐藏实例 inert，
快捷键和 body portal 由 active 控制，Info/Sync/Delete 草稿及已发出的异步操作仍归原 owner。

存储 port 固定 cwd/path，Info 的正文保存只允许同项目配对 data.json。load、refresh 和
save 共用 cwd/tab 读代次，真正发布及 React updater 时仍须有效；shared cache 被失效后，
旧 Promise 仍回原 waiter，但不能重新 seed 或释放替换请求。删除回执携带原 cwd/project，
仅清理路径段内文档与缓存，未知旧回执只刷新，不清其它文件。Pin/focus 由当前可见 Chat
presentation token 路由，不保留首次打开文件时的聊天闭包。完整浏览器/终端/trace 面板实例
契约和持久草稿恢复继续独立迁移。

Agent trace 的执行 owner 由 server composition 注入 ID 工厂与当前 turn writer；纯
`action-trace-owner.ts` 不生成身份。每次 debug 在核验原 HTTP 宿主后捕获 execution/run、
thread、cwd、action/param、完整 binding 和 task invocation path。父子沿用同一请求执行
状态及取消信号，仍只有现有 AI SDK loop；原生隔离继续依赖每次 HTTP 调用的专用管道、
progress callback 与 logger/context，不把新增 UUID 当作原生事件已有 run ID 的证明。
bridge 以 run 身份登记、完整 owner 比较和单次终结；终态摘要独立保留，事件重放与精确
去重有界。artifact、traceRef 和模型摘要保留同一 owner，写入/读取使用原 cwd。

UI view lease 将运行身份与呈现 thread/generation 分离，切 cwd 不改原运行的读取位置。
订阅者只观察，关闭或卸载不取消原生工作；结果未知与原生成功/失败分别投影，迟到真实
终态可纠正观察错误。历史无 live feed，旧无 owner 格式只生成展示身份；start-only
历史明确结果未知，已关闭 view 的墓碑防止消息重放重新打开。通用 direct tool 入口独立
创建 execution state 和 synthetic thread，释放所属资源。取消只保证 Node 观察停止，
完整原生停止协议与真实宿主并行 trace 仍需验收。

手动启动复用 `prepareOwnedActionTrace`，独立 manager 创建 server execution/thread/run，
不继承 Chat ALS 的目标。POST 先核验绝对 cwd、已知项目侧车及唯一宿主，再单次启动；
项目完整记录在准备后再次比较，不能据此声称 C# 原生 dispatch 与本地文件已形成原子 CAS。
GET 只转发只读 feed。ACK 返回后解除请求信号，后续生命周期归 manager 的 timeout 和
service shutdown；关闭观察不取消原生动作。shutdown 先发布共享 Promise，再触发同步
abort listener，有界等待实际 settlement；超时保留 entry，迟到完成后才释放。
`didDispatch` 事实区分派发前拒绝和 ACK 窗口内结果未知，不重试可能已发出的运行。
客户端从当前 presentation port 捕获 thread/cwd/generation，pending view 仅向原 owner
提升；标题和内联命令行是展示元数据，不进入原生身份或改写 inline payload。
浏览器不再保留默认 serve URL、旧 SSE POST helper 或 actionId/param 全局写入缓冲。
artifact hydration 必须接收显式 view，读取前检查 cwd、有效代次及取消，文件返回后再
比较完整 owner；旧无 owner 格式只交给独立历史 view。旧页签前缀识别保留，已无调用的
旧 key 构造/解析与展示回灌入口删除，避免以后重新绕过运行归属。

历史消息分支确认携带 mounted owner、thread、锚点、草稿与消息 revision。确认返回后先检查
当前 owner，再通过 AI SDK 的同步 functional updater 比较实时 store；React 的节流消息副本
不能作为最终 CAS。成功后才清理草稿并沿用原有 slice → enqueue/send 路径，失败不截断、
不发送。隐藏会话保留编辑状态；确认弹窗拥有自己的 pointer/Escape，避免点击确认先退出
编辑。审批、Launcher、Agent loop 和持久化格式沿用既有实现，其他会话职责继续拆分。

DSH 参考固定为 [DeepSeek Harness `687f282`](https://github.com/deepseek-ai/deepseek-harness/tree/687f282e8625c6b8d11ff58211a90524be2e4317)：

- [布局槽位](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-layout/src/client/index.ts) 将框架几何与业务区域分开。
- [面板定义](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-sidebar-right/src/client/tab-registry.ts) 将静态身份、渲染器与实例状态分开。

本项目采用这些组合边界，以 React props 和静态类型定义实现；没有引入 Cordis、DSH loop、DSH Session 格式或动态插件加载。后续功能先接入已有业务服务，在需要展示的位置增加组件与入口；不要为布局扩展复制工具注册表、事件流或会话状态源。

## 3. Turn 生命周期

一次聊天 turn 固定经过以下阶段：

1. `resolve request`：修复中断消息、解析模式/slash、解析模型选择。
2. `direct route`：Launcher 可命中无需模型的确定性快捷路径；live 文档 intent 不进入该路径。
3. `resolve model`：检查配置并创建 AI SDK `LanguageModel`。
4. `resolve scope`：合并消息引用和 Action Designer 默认目标；live intent 核验本轮原消息、私有授权与完整 owner identity。
5. `prepare runtime`：生成唯一 `TurnPlan`，加载最终选择的工具并应用权限/调用策略，生成 system 和上下文预算；live intent 只组合客户端端口与允许的辅助工具，不初始化外部 MCP。
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

runtime 在最终工具交集、模式门禁与调用策略组合后只解析一次 `TurnPlan`。计划和执行共用
`agent-tool-mode-guard.ts` 的现有操作限制及显式只读端口事实；`workspace_program` 在 Ask
可读本地数据，但 diagnostics 仍不可执行。历史反馈要求的步骤若不在最终工具集，或其操作
被当前模式拒绝，保留未满足要求及 `blockedNextAction` 原因，移除可执行 `nextAction`，
恢复与验证转为 `ask_user`。runtime snapshot 投影这份计划，不重新从历史选出被拒绝的步骤。
这不证明未知外部工具的副作用或 wrapper 操作描述已全部统一。

invoke 的持久化事实由纯 `qkrpc-operation-effects.ts` 定义：宿主修改与本地文件持久写
分别描述。宿主绑定仍只消费前者；HTTP/CLI 的未知收据、transport fallback 和工具重试
消费两者。`action.open`、`action.extract`、`subprogram.export` 读宿主但会导出文件，
缺少确认后不能当纯读重放。未知操作保守处理，只有显式 dry-run 保留离线语义。
CLI 只有确定启动失败才说明命令未开始；缺少 spawn 事件不能反推未派发。结构化
`WRITE_RESULT_UNKNOWN` 不再被 stderr 重新归类为连接失败或丢失为自动恢复建议。
这些事实只覆盖 invoke，不替代工具模式权限或包含 wrapper 后续的工作区 augmentation；
bootstrap、父子权限与 TurnPlan 的完整统一仍继续迁移。

Ask 的动作/子程序 get 使用显式读取执行端口，绕开兼容 get 的自动导出，并重建限定命令，
只通过 CLI `--no-bootstrap` 连接现有宿主；不进入可能自启动的 HTTP pool，不重试或转走
导出入口。当前模式的最终 wrapper 同样约束历史审批续跑与子代理，未提供读取端口时拒绝。
Agent 的兼容导出行为保留。Ask 的 workspace 也使用显式本地端口：只读取已有完整项目，
缺少正文时返回 `workspace_program_not_local`，不补空文件、不导出；项目列表不修补元数据。
summary 和文件读取共用该策略，最终 wrapper 缺读取端口时拒绝，直接 Ask 调用再作校验。
get 的单次失败保留原 exit/error/payload/绑定，不伪装成功或宣称已重试，连接失败只说明
手动连接或切 Agent 恢复；不会建议调用 Ask 中不可用的恢复工具。

尚用自启动 adapter 的远端 query、step catalog、FA、Launcher resolve、设置和 wait 已从
Ask 默认目录移除，最终执行入口也拒绝其旧审批或显式选择；远端 diagnostics 同样拒绝。
pre-turn 不请求远端 Designer 标题/选中步骤，保留消息和 embed 明确提供的本地目标。
每项能力须先实现并验证非启动读取端口后再恢复；外部 MCP 继续依赖其显式只读声明，
这不代替操作描述、TurnPlan 和实际 adapter 副作用审计。

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
