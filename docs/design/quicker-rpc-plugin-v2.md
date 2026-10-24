# QuickerRpc.Plugin.V2 能力对齐计划

> 状态：net10 对齐中。当前已有可运行 adapter，但仍存在 stub 与关闭 capability；不得描述为与 net472 完全对齐。

## 目标

在不复制 Runtime 业务逻辑的前提下，使 `QuickerRpc.Plugin.V2` 对 V1/net472 已开放的 qkrpc 能力做到：

1. 同一 Contracts DTO 和 Runtime handler。
2. 相同行为、错误语义与 capability 声明。
3. V2 宿主不具备的能力有明确“不支持”决策，而不是假成功或长期 stub。
4. 离线 composition/probe 与真实 Quicker V2 活进程验证同时通过。

用户已将近期重点调整为自动识别 V1/V2、迁入 Quicker 新动作设计器、统一 Agent 写动作。
交付顺序以 [主线计划](../product/README.md#统一-rpc-与动作设计器当前主线) 为准；本文继续维护
V2 adapter 的真实能力与对齐门槛。动作编辑链优先于分享、Chrome 等其余完整 parity，
不能因尚有无关能力 stub 而推迟设计器迁移，也不能提前开放未实现操作。

## 当前结构

### V2 插件的私有依赖图

V2 Release 的五个自有卫星（Contracts、AgentModel、Host.Abstractions、Runtime、Transport）
用插件自身的 `Version` 作为 assembly simple name 后缀。旧插件的全局 resolver 仍可能先运行，
因此不能依靠新的注册顺序或只检查新 handler 的版本。嵌入资源与所有自有引用必须使用
同一后缀；宿主的 Microsoft/Newtonsoft 程序集继续共享，不根据宿主版本号猜测依赖。

`PrivateAssemblyVersionSuffix` 只由 V2 Release 图自动传入，恢复、生成文件和输出使用
`obj/v2-private/<version>` / `bin/v2-private/<version>`，避免与 CLI 的中性图共享缓存。
NuGet 的递归恢复也须传递该属性；仅设置普通 ProjectReference metadata 不足以隔离 assets。
CLI/netstandard 保持短名，net472 保持原有后缀规则；Runtime.Test 显式选中性图，避免同一
测试程序集同时引用两套 Contracts。独立进程 fixture 覆盖旧 handler 先注册、嵌入传递依赖、
错误 requester/完整身份和两种图的交替恢复编译。

resolver 仅服务本插件或本包嵌入的同一 image，并核验请求及返回的完整程序集身份。
V2 用显式 MSBuild target 嵌入原 allowlist 的 CopyLocal 依赖，沿用 resolver 的资源名契约，
不生成 Costura 的宽松 resolver；module initializer 先注册自有 resolver，
再进入禁止内联的 Transport diagnostics 初始化，避免 JIT 在注册前解析第一个私有引用。
这里读取自有资源的 MVID 只用于 image 归属，不构成宿主适配表、宿主版本特判或业务权限。
这些编译与无宿主加载验证不能代替后续协调部署后的实际 V2 业务验收。

```text
QuickerRpc.Plugin.V2
  -> V2QuickerRpcHost
    -> core adapters / catalog / run / settings / launcher / docs
    -> reflection accessors for current Quicker V2 host
    -> optional external IQuickerRpcHost when Quicker provides one
  -> shared QuickerRpc.Runtime
  -> shared QuickerRpc.Transport
```

| 范围 | 代码入口 |
|---|---|
| 组合与启动 | `QuickerRpc/src/QuickerRpc.Plugin.V2/PluginV2BootstrapStack.cs`、`Composition/` |
| capability | `Adapters/V2QuickerRpcHostCapabilities.cs` |
| 核心端口 | `Adapters/V2CoreHosts.cs` |
| 搜索/目录/运行/设置/说明/Launcher | `Adapters/V2*Host.cs` |
| 当前缺口 | `Adapters/V2StubHosts.cs` 与其它 `V2StubMessage.NotImplemented` 调用点 |
| Quicker V2 访问 | `Reflection/QuickerV2*` |
| 离线验证 | `QuickerRpc/tests/QuickerRpc.Runtime.Test/*V2*Tests.cs` |

## 能力矩阵

| 端口/能力 | 当前 V2 | 对齐要求 |
|---|---|---|
| Session | 已有 adapter、专属 endpoint、发现/选择与 wire host-session/capability；旧插件身份保持未知 | V1 活进程已验收，双宿主及 V2 实际选择/重启继续验收 |
| ActionPrograms | 原始 JSON source adapter、catalog/draft 身份、条件持久化与共享 YAML codec 已有离线实现；实际 2.3.20 的存储访问不满足该反射入口，source read/write 保持关闭 | 先取得稳定原文端口及可靠 Designer/提交收据，再验收真实动作保存；公开 authoring rollback 不等价于 source save，见下文发布版边界 |
| SubPrograms | 已有读写/同步路径 | create/update/delete/publish 逐项验证 |
| ActionRuns/trace | 已有 V2 run/trace service | 普通运行、trace、失败位置与取消一致 |
| ActionCatalog/Search | 已有查询/搜索；部分布局操作 stub | action/profile/layout 操作逐项清零或决策不支持 |
| Settings/ActionDocs/StepRunners/Launcher | 已有 adapter；StepRunners 的 UI 详情使用完整 UI serializer，Agent 详情维持压缩结构；非空摘要已接原生只读 leaf | 真实 DTO/dispatcher fixture 通过，V2 活进程读取仍待验收；其余与对应 V1 命令做 parity smoke |
| ActionSharing | 仍有 stub | publish/update/preflight 完成或明确宿主边界 |
| Expressions | 已接共享表达式服务 | 按实际 V1/V2 行为验证，不再按未实现处理 |
| ChromeControl | `false`/`null` | 实现后再开启 capability |
| Triggers | `false`/`null` | 实现后再开启 capability |
| Designer UI | UI capability 仍 `false`；非空 Designer port 仅提供独立的 quick insert、toolbox 和 FA geometry 读取 | 原生 API/DTO 与现有 dispatcher 决定三个读操作；打开编辑器/context 等继续 unsupported，完整 UI 只有实际支持后开启 |

<a id="v2-source-release-2320"></a>
## Quicker 2.3.20 的 source 兼容边界

本节依据已核验的实际发布 DLL 的 PE/IL 静态分析，不以开发分支源码或 fake 仓储代替发布版行为。
目标为 `2.3.20.0`，ProductVersion 标记的提交为
`623c38be29c2b5dd3b4972e813f5ffc4ea588d93`；`Quicker.dll` SHA-256 为
`2CAD39DCC928B37137F1F508EB3536A496E06BA23CC1251666C2A8F1884E5B77`，
`Quicker.Ai.Workspace.dll` 为
`F90F00BB03CC66E8ECD4F35E6E7B29AAD0C36504BE25F7D3D09DEDD0B12411FD`。
这是合同兼容证据，不能当作动作写回、重启或全量 V2 验收。

发布 DLL 中部分私有 DI、动作命令和暂存仓储类型名已混淆，原反射入口不能据此创建 source 存储。
不硬编码混淆名，不按方法形状搜索并授权任意服务，也不另开用户数据库。
StepRunner 的 `ActionStep.StepRunnerService` 与公开 `IStepRunnerService` 是另一条仍可用的原生只读入口；
目录及 input-contract 读取不能证明 source 持久化能力。`legacyBody` capability 为 true 也不等于原文读写已通过。

### 已有公开 authoring 合同

`Quicker.Modules.Headless.Ai.QuickerActionProgramSource` 与 `QuickerActionProgramSink`
仍具有可定位的公开名称，其公共合同位于 `Quicker.Ai.Workspace`：

| 接口 | 已确认的实际语义或限制 |
|---|---|
| `IActionProgramSource.GetProgramAsync(actionId, includeDrafts, cancellationToken)` | `includeDrafts=true` 固定读取暂存身份；读取异常不回退正式动作，无暂存时返回空。正式动作必须用明确的 action 身份，不能因未找到就改读同名全局子程序。 |
| `ActionProgramSnapshot.Info` | 包含 `StorageSource`、`DraftId`、`EditVersion`、`StorageChangeToken` 及外观/选项；须保留它们的来源与完整身份，不能从模型或 UI schema 补造。正式动作 token 来自序列化后的 native action，暂存 token 来自原生 draft。 |
| `ActionProgramSnapshot.Data` / `RawStoredActionJson` | 普通 XAction 的 Data 来自 typed payload；RawStoredActionJson 不是普通 XAction 的完整原文出口，它仅在部分不可编辑投影分支中提供原稿。不能因字段存在就承诺原文保真。 |
| `IActionProgramRollbackSink.RestoreSnapshotAsync(snapshot, expectedCurrentEditVersion, expectedCurrentContentHash, cancellationToken)` | 内容 hash 重载确实存在，空 hash 被拒。动作分支在现有 UI dispatcher 中构造完整候选，catalog/draft 分别复验版本和内容 token 后进入原生条件写；不能概括成“V2 没有 CAS”。公共子程序不支持这个内容绑定重载。 |
| `IActionProgramSink.PatchFromWorkspaceAsync(...)` | 接受 native working copy 目录；它不是直接接受原始 body JSON 的无副作用保存接口。不能为适配 RPC 临时制造另一套工作副本/基线。 |
| `QuickerWorkspaceAuthoringFactory.Create(workspaceRoot)` | 会确保 Headless 服务初始化并创建 workspace 目录；不用于 health/capability 探测，也不用于取得一个假定无副作用的 repository owner。 |

公开 rollback 仍不满足 qkrpc source save 的全部合同：

- 普通 XAction 经 typed `XAction` / `XActionDto` 重建 Steps、Variables、SubPrograms；该 DTO 没有未知字段扩展容器，不能据此承诺保留存储原文中的未知字段。
- rollback 同时处理 Info 中的 catalog 元数据；它不是已声明的“仅修改程序体”端口。不能把默认值重投影成用户未请求的元数据更新。
- 持久化后，索引刷新、通知或部分历史记录错误可能仅被记录，公开成功结果没有完整透传这些诊断。`ActionProgramPatchResult` 的 Ok/VersionConflict/Message 不提供明确的 persisted/commit-state，不能恢复现有 `SOURCE_POST_COMMIT_FAILED` 语义。
- 所审计的公开动作 rollback/CAS 路径未提供可供外部调用者依赖的 Designer 已关闭证明。调度到 UI 线程不等于检查已打开或未确认的编辑草稿。

### 原文 owner 与最小原生扩展

实际原文由 native 动作命令通过自己的写协调器及已持有的
`ISyncV5LocalRepository.GetItem` 读取 `ItemDataJson`；暂存原文则来自原生 draft 的 `ActionJson`。
原生提交最终会调用该 repository 的 `TryUpsertLocalItemIfUnchanged`。
稳定的 repository 接口存在，但目前没有确认可供插件取得这些**已构造 owner**的稳定公开入口；
不遍历私有字段取实例，不实例化另一个仓储，也不绕过原生通知和 Designer 保护直接写库。

下一片需要薄的 native raw-source 端口，复用已有 owner、存储和命令链；不是新增存储源。
建议合同如下，尚未实现，不据此开启 capability：

| 操作 | 必要输入与结果 |
|---|---|
| `TryGetCurrentPort()` | 只返回当前宿主已经构造的端口及合同版本/逐操作可用性；不创建服务、工作区、dispatcher 或目录。公开名称和成员须经发布混淆后的 PE 检查。 |
| `ReadRawAsync(actionId, cancellationToken)` | 返回完整原始 native action JSON，以及 catalog/draft、不可变 draft id、版本和绑定 owner 的内容 token；读取错误、身份变化、未知来源不回退。普通 XAction 也必须取得原文，typed Data 不代替它。 |
| `SaveBodyAsync(actionId, expectedIdentity, bodyJson, cancellationToken)` | 只合并已允许的 body 字段，保留其它原始字段；最终提交前核验 native Designer 状态，再在同一原生条件写内检查版本/hash/存储身份。force 不绕过 Designer 或未知状态。 |
| 写入收据 | 区分确认未写入、已提交、已提交但刷新失败、结果未知；保留实际版本/存储身份及诊断。已派发后的取消不承诺回滚，未知结果不自动重发。 |

合同版本、原生来源、状态及 false/0/null 必须显式保真；缺失或未知状态不能默认成已关闭、可写或成功。
qkrpc 后续先接已有 DTO/Runtime 的严格只读实现及可选的**分操作** availability：
旧 `IsProgramSourceAvailable` 同时控制 read/write，不能只实现读取就把两项一起开启。
只有取得完整原文并验证绑定身份后才开放 `action.source.read`；缺少写入任一保证时
`action.source.write` 仍为 false。V1 继续兼容原端口，无原生扩展的旧 V2 明确 unsupported。
原生侧和 adapter 都需覆盖未知字段保留、错误 owner/draft、取消晚到、CAS 冲突、打开 Designer、
提交后刷新失败和真实发布产物 shape；在这些条件满足前不创建空壳接口 PR。

原生 MCP 是另一条可评估的明确 adapter 边界，不能静默回退：须证明其 server 属于同一
PID/进程创建身份与 RPC 会话，保留 working-copy/revision、client consent、写权限及未知结果语义。
若 open 会创建 native draft，就不是纯 host read，必须如实进入操作效果和审批约束。
不使用 MCP script/reflection 绕过缺失的公开端口，不借另一宿主或账号 CLI 绕过 capability。

## 自动识别与设计器接入优先项

### 活进程验收隔离门槛

2026-10-24 用户已提供并授权使用局域网 V2 设备。验收先记录该设备的实际进程、
宿主版本和插件会话，再部署已核验的产物并使用专属测试动作；设备启动不代表任何
qkrpc capability 已经验证。逐项结果继续进入本计划的动作读写与重启矩阵。

首轮已在局域网 Quicker 2.3.20（release-v2 `623c38be`）启动 171 插件，并用私有
172 候选 CLI 验证实际 V2 发现、会话绑定和只读 health；同一候选也识别本机 V1。
提权 Windows 客户端改为核验实际管道 owner 与有效用户 SID，用户 owner 的管道成功
握手，外部 Administrators owner 的管道在发送任何 RPC 字节前被拒绝。服务器的受保护
用户 DACL 不变；现有 Quicker 和 MCP 进程保留。该候选尚未替换日常安装。

171 在该发布版的 source read/write 与 input-contract capability 均为 false，两个模块
UI 查询也实际失败。发布版私有 DI/存储实现名称与当前开发源码不符；已取得并校验实际
加载 DLL 的元数据，后续 adapter 优先使用稳定公开接口。只读目录、原生输入契约和
source 读写分别验证，不能由健康连接、公开方法名或离线 DTO 推定写入能力已具备。

Debug Eval profile 隔离账号正文，不等于隔离完整进程。现有启动路径仍共享 WebView
目录、MCP Home/config、日志及发现文件，也可触发浏览器注册、全局输入 hooks、IPC
和第三方监听；仅隐藏 Shell 或设置 Eval DataRoot 不能满足自有测试实例的边界。
`QUICKER_HOME` override 也不能同时隔离所有账号日志与历史。真实 V2 验收须先提供
完整的自有进程/资料根与显式端口边界，或使用隔离 OS 用户/VM；不使用会停止其它
headless 实例的默认启动脚本。只认本次源版本与构建输出，离线 DTO/PE fixture 和旧
Debug/Release binary 均不能替代实际加载及双宿主验收。

### 接入顺序

1. `IQuickerRpcHost.Info` 与实际逐操作 capability 已暴露为 wire 握手；bootstrap session
   内稳定，独立 endpoint、实例发现/选择与持久写入绑定已实现，V1 活进程已验证。
   两个 fake 宿主可独立路由；真实双宿主选择、V2 与重启仍须实际验收。
2. Designer 初期复用 Quicker 的结构化编辑会话、`ActionStorageIdentity`、预期编辑版本与
   host persistence 语义；适配 V1/V2，而不是将 V1 压缩 Agent JSON 当作完整设计器文档。
3. V2 source 仅在具备原生条件存储 API 和 UI dispatcher 的宿主开放；`TrySaveAction` 必须明确确认编辑器未打开，状态
   不可读时返回 `DESIGNER_STATE_UNAVAILABLE`，打开时返回 `DESIGNER_OPEN`，force 不绕过。
   旧 body/presentation 写入已传播结构化错误码；反射实际源码的离线 fixture 覆盖无持久化副作用。
4. Runtime 的十个可选 Designer 入口已使用现有 DTO 返回明确 unsupported；预取消请求
   不读取端口、不调度其它宿主。DesignerUi=false；独立读端口不代表编辑器打开、完整
   catalog/FA 搜索、剪贴板或 text tool 已支持。
5. 分别在 V1/V2 专用测试动作上验收读取、编辑、校验、保存、重读、冲突和重启；写入不对
   另一个实例自动重试。其余 capability 逐项继续下表流程，不冒充全量 parity。

## V2 Designer 只读基础

`stepRunner.inputContract.read` 另有可选的原生输入契约端口。它要求已加载的精确
`Quicker.StepEngine` API、现有 `ActionStep.StepRunnerService` 和 UI dispatcher；每次在
该 dispatcher 上调用当前 service 的 `GetRunner`，读取原始定义，再复用共享 policy
builder。没有对应 API、service 或 dispatcher 的宿主继续 unavailable，不从 UI/Agent
目录或缓存补权限。返回 provenance 为 `hostKind=v2`；旧 V1 builder 入口保持原样。
原生默认控制值、精确空值、变量模式、输入来源、封闭选项和未知可见性均保留原有
严格边界。该代码已有真实 DTO/API shape 与取消、DI/manual、序列化的离线回归，
实际 LAN V2 的绑定读取和能力声明仍待部署验证，不代表运行时类型转换或完整 parity。

`GetUiDetailAsync` 使用 `StepRunnerUiSchemaJson`，保留图标、control field、变量模式和
参数 UI 信息；Agent `GetDetailAsync` 保持现有压缩格式。两条路径共用 catalog mapper，
不把压缩 Agent schema 充作完整 Designer schema。

摘要只调用精确的静态 `QuickerDesignerStepSummariesBatch.Compute(string)`，通过
现有 `Application.Current.Dispatcher` 调度；不初始化 Headless bridge/router 或账号服务，
不制造 dispatcher。请求把嵌入子程序映射为原生 `subProgramsJson`，原生缺失、异常或
返回无效结构时明确失败。排队前、执行前后和返回时检查取消；已开始的原生读取不能
宣称被中止，迟到结果不交付，fault 被观察。公开构造入口与 DI/manual 组合保持兼容。

实际编译 Plugin.V2 与 Runtime 三目标通过；15 项定向测试及不引用 V2 的 6 项相关测试
通过，包含真实 native response DTO 与所属 dispatcher fixture。另行运行的 31 项
composition 测试有 6 项环境/原生依赖失败，未做干净基线对照，不宣称该整类绿色。
这些证据均不启动 Quicker、不访问账号数据库，V2 活进程与完整 Designer 能力仍待验收。

`V2DesignerReadHost` 另接三个只读操作：quick insert、toolbox 搜索与 FA geometry。
前两项以真实原生 catalog DTO 建立每个 host 自己的纯搜索 snapshot，保留分页 JSON；
后者只映射原生向量字段，不补造 label/unicode，非正数、非整数或溢出尺寸逐项拒绝。
反射仅匹配当前宿主已加载的精确类型和方法；缺少纯 Designer Core 或现有 dispatcher
时保守不可用，不为能力探测加载/初始化整个 Headless/账号栈。空或取消的 catalog 不发布。

可选 `IQuickerRpcDesignerReadAvailability` 与三个 wire keys
`designer.quickInsert.read`、`designer.toolbox.read`、`designer.fontAwesome.resolve`
分别声明读取，不借用 DesignerUi。旧 V1 的已实现 Designer port 保持兼容；未知宿主
没有显式可用性时不推定支持。V2 旧 FA search 的 maxResults/expand 与原生分页语义不同，
继续明确 unsupported；本片不冒充完整图标搜索/选择器。

实际 Core DI 与 manual bootstrap 都提供同一默认读实现。Core 原有自解析 IHost factory
与 Launcher 缺少 Search interface 注册两处组合问题已最小修复；实际有界解析 fixture
覆盖这两条链。25 项定向测试、无 V2 引用路径 7 项相关测试、真实 Plugin.V2 与 Runtime
三目标构建通过，独立审查通过；活 V2 加载状态与完整双宿主仍待验收。

## Font Awesome 分页与读取探测

完整 FA 分页使用独立可选 `IQuickerRpcDesignerFontAwesomePageHost`，通过
`SearchFontAwesomeIconsPageAsync` 和 `designer.fontAwesome.page.read` 连接。V1 直接使用
自己的全 enum catalog；V2 匹配 native `SearchPage(string,string,int,int)` 与七字段页 DTO，
保留 query/style、skip/take、完整 total 和 hasMore，检查规范化与返回事实一致性。
Brand 别名、96 默认/300 上限、中文/英文评分与品牌排序按来源处理；旧 search 不变。

读取探测已从会补载 satellite 的通用 `ResolveType` 改为精确已加载 assembly lookup。
此收口同时覆盖三个已有读 factory 和 page，保留 injected 构造入口；不扫描磁盘、不加载
模块、不创建 Application/dispatcher，缺失时 capability=false 和明确 unsupported。

V1 page/旧 search 15 项、V2 catalog/handshake 22 项、无 V2 引用 7 项、Transport 14 项及
修后原 owner 断线和 metadata 定向回归通过。实际 Plugin.V1/V2 与 Runtime 三目标构建
通过；V1 构建有 243 条未分类警告，未做干净基线对照。当前 2.2.11 编译宿主未收录新
page DTO/resolver，且主程序集有 logging module initializer，故只用命名 DLL 的 PE metadata
核验缺失与拒绝路径；固定 DTO/dispatcher fixture 不等于真实 native 算法或活 V2 验收。
Node page adapter 和完整图标选择器仍待接线。

## V2 native source 边界

以下是现有严格 adapter 的实现合同及离线回归范围，只在匹配的原生存储 API 上可用。
2.3.20 的原文路径尚未接通；[发布版限制](#v2-source-release-2320)不能由本节的 fake 仓储结果替代。

`V2ActionProgramSourceService` 复用 `IQuickerRpcActionProgramSourceHost`、Runtime handler、
`V1ProgramSourceCodec` 的原生字段映射和共享正文合并器。V2 的 `XActionDto` 原生字段与
该映射一致；typed DTO 仅做校验，持久化始终保留原始 JSON，避免固定模型丢失未知字段。
读写从 V2 adapter 自行调度到 Quicker UI 线程，不能依赖 V2 的 inline scheduler。

保留原 `ApplyActionProgramSourceAsync` 的 CLR/wire 签名，身份写入使用不同名的
`ApplyActionProgramSourceWithStorageAsync`。Console 依据已打开 bundle 的存储身份一次选路；
新入口缺失时不降级重试，旧 V1 bundle 继续走原入口。存储身份不替代独立的宿主绑定。
原生读取、YAML 与磁盘 checkpoint 复用数值保真 parser：普通数值保留原类型，无法通过
普通 JValue 原样往返的高精度数、指数和负零保留经过验证的原始数值词法。

`QuickerV2SourceStorage` 先严格查询 `IActionDraftRepository.GetDraftByActionId`；失败不回退
正式动作。草稿使用 exact draftId/CurrentVersion 与 `TrySave`；正式动作用
`ISyncV5LocalRepository.GetItem` 的原始 `ItemDataJson` 和 `TryUpsertLocalItemIfUnchanged`
的 ChangeToken CAS。同步策略、版本历史仍由宿主仓储处理；提交后刷新索引、发布变更、
`NotifyActionUpdated`、触发同步，任一后续失败均保留 `Persisted=true`。结果不确定时返回
`SOURCE_WRITE_RESULT_UNKNOWN`，调用方必须重新打开，不能自动重放。

sidecar/baseline 保留 `kind`（catalog/draft）、`draftId`、`version` 和原生 snapshot hash；
force 只放宽同一身份的内容版本冲突，不能跨 draftId/catalog 改道，也不能绕过 Designer。
未修改正文不增加草稿历史。外置脚本/变量默认值与连续 checkpoint 继续使用共享 source bundle。
继承来源正文（`UseSource=true`）明确拒绝，避免把缓存/投影误作可写本地正文；须先在 Quicker
保存本地正文。缺少上述 API 的旧 V2 宿主保持 source capability=false。

## 对齐工作顺序

1. 从 Contracts 的 host port 与 V1 adapter 建立逐方法清单。
2. 搜索 V2 中全部 `V2StubMessage.NotImplemented`、`NotSupportedException`、null capability。
3. 先补共享 Runtime 已有 handler 所需的 host adapter，不在 V2 复制 handler。
4. 每补一个端口，增加成功、失败和 capability 三类测试。
5. 使用同一 CLI/MCP 输入分别运行 V1/V2，比较结构化输出和副作用。
6. 最后处理 Designer/ChromeControl/Triggers 等宿主 UI 或可选能力。

## 完成门槛

- V1 当前公开命令均进入矩阵，并有“等价/明确不支持”结论。
- V2 可用路径不再返回 `V2StubMessage.NotImplemented`。
- capability 与实际注入 adapter 一致，不出现 capability=true 但调用失败。
- `PluginV2CompositionTests`、V2 catalog/probe tests 和相关 Runtime tests 全部通过。
- 对动作读写、子程序、运行/trace、搜索、设置等主流程完成活进程 smoke。
- 构建/发布配置只包含必要 runtime 依赖，包体积单独核验；不能用能编译代替能力对齐。

## 验证

V2 项目通过 `QuickerRpc/Directory.Build.props` 的限定项目过渡钩子，使用
`Quicker.Sdk/build/Quicker.Sdk.props` 与官方 targets；不再依赖旧 `qkref.net10.props`。
workspace 中按 SDK 入口文件定位源码与本地宿主目录；独立 checkout 可传
`-p:QuickerSdkRoot=<Quicker.Sdk目录>`。显式 `QuickerDllPath`、`QUICKER_V2_DLL_PATH`、
`QUICKER_HOST_ROOT` 等宿主配置遵循 SDK 的优先级。缺少 SDK 会以 `QKRPCSDK001` 拒绝构建，
不会把宿主引用注入 Console、Runtime 或其它项目。现有版本化 DLL、Fody 与发布流程保持原配置。
V2 宿主的 `Microsoft.AspNetCore.App` shared framework 提供核心 Hosting/Logging/DI；项目用
同名 `FrameworkReference` 编译，不将这些程序集作为额外 NuGet 依赖打进插件。

先编译真实 V2 项目，再只运行不访问宿主的 fixture：

```powershell
dotnet build QuickerRpc/src/QuickerRpc.Plugin.V2/QuickerRpc.Plugin.V2.csproj -c Release
dotnet test QuickerRpc/tests/QuickerRpc.Runtime.Test -c Release -p:IncludeV2HostTests=true --filter "FullyQualifiedName~V2ActionEditingGuardTests|FullyQualifiedName~HostSessionRpcTests"
```

新增 source 的宿主无关回归使用 `-p:IncludeV2HostTests=false --filter FullyQualifiedName~V2ActionSourceTests`。
实际编译插件与真实 DTO fixture 使用 `IncludeV2HostTests=true`，设置
`QKRPC_V2_TEST_HOST_ROOT` 为明确的本机编译宿主目录，再运行
`V2CompiledActionSourceTests`；该 fixture 不读取宿主数据库、不解析真实动作、不连接进程。
`ActionSourceWorkspaceTests` 验证离线 dry-run、文件、sidecar 与部分结果，
`ActionProgramSourceContractTests` 验证真实随机管道的 identity/partial DTO 往返。

以下 probe 检查另行按本机宿主环境运行，不能作为纯离线 fixture 使用：

```powershell
dotnet test QuickerRpc/tests/QuickerRpc.Runtime.Test -c Release --filter "FullyQualifiedName~V2|FullyQualifiedName~QuickerV2"
```

修改 V2 插件后还需按根 `AGENTS.md` 执行目标构建/热更新和活进程验证。产品状态同步更新到 [RPC](../product/README.md#p-rpc)。
