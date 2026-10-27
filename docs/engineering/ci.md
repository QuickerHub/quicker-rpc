# 持续集成

[CI workflow](../../.github/workflows/ci.yml) 对每个 PR、`main` / `master` push
和手动运行执行阻断检查，不使用路径过滤；共享代码、配置和测试资产变化都会触发。
开发分支只通过 PR 触发一次，避免同一次提交重复启动 push 与 PR 两条流水线。
同一 PR/分支的新运行取消旧运行。工作流只有 `contents: read` 权限，不使用用户密钥。

## 检查范围

| Job | 环境 | 验证 |
|---|---|---|
| Generated knowledge | Ubuntu / Node 22 | CLI 指南和分发 skill 与知识源一致；不安装依赖 |
| Offline Agent | Ubuntu 和 Windows / Node 22 / pnpm 10.18.3 | 冻结锁文件安装、TypeScript、显式离线检查、工具/eval/编写/trace 回归、Electron 模块静态检查 |
| Designer DOM | Windows 2025 / Node 22 / `global.json` SDK / 镜像预装 Microsoft Edge | 真实无头 Edge、设计器组件与工作台 DOM 回归；实际 C# source codec、本地 bundle 保存、生成 fixture、网络 guard、独立临时 profile |
| Static SPA | Windows 2025 / Node 22 / 镜像预装 Microsoft Edge | 完整构建、搬移、原生验证与 React + 独立 Node 服务；原有 generated fixture、fake model、工作台编辑与自然退出 |
| Host-independent .NET | Windows / `global.json` SDK | Runtime/Transport 全目标框架构建；Console、Transport、fake-host Runtime 单测；保留 TRX |
| Transport contracts | Ubuntu / `global.json` SDK | Transport 全目标编译、完整 net10 合同测试、实际 netstandard2.0 客户端绑定与 Ping；记录 TRX 与 receipt |

安装使用 `pnpm install --frozen-lockfile`，缓存仅包含 pnpm store，不跨平台复用
`node_modules`。保留原生模块构建，因为 SQLite fixture 需要 `better-sqlite3`；仅跳过
Electron 和 Playwright 二进制下载。Node 22 跟随维护补丁，依赖图由现有锁文件固定。
.NET 使用现有中央包版本；目前没有 NuGet lock 文件，不能声称其传递依赖已锁定。

Ubuntu 安装后用锁定的 node-gyp 9.4.1 重编译实际 node-pty 1.1.0，确认保留的
`build/node_gyp_bins/python3` 构建链接与 Release 原生模块同时存在，
再执行既有生产构建、物理搬移与验证。这样 pnpm 缓存不能掩盖源码构建的目录形态。
运行目录仅排除包根下物理目录 `build/node_gyp_bins`；Release、Debug、prebuilds
及平台所需的原生伴随文件（如 macOS 的 spawn-helper）照常复制。辅助目录及其父级不能借此作为链接，保留文件的其它越界链接、
指入辅助目录的别名和声明入口仍会被拒绝，不放宽包内容边界。

两平台的 closure 门禁通过与 `pnpm build` 相同的
`build-agent-production.mjs` / `buildAgentProductionRuntime` 默认生产入口，执行文档、
API manifest 和 TypeScript 检查后只构建一次。产物物理搬移前后必须实际存在普通文件
`runtime-mode.json`，格式与版本有效、模式为 `static`，且最终 native 验证后其 SHA-256
仍相同；缺文件时运行时 reader 的兼容默认值不能充当 marker 证据。mode 文件先走元数据
检查，再有界读取；receipt 记录生产入口和 marker 的模式/schema/hash，原 source、链接、
精确 Node 原生导入验证与只上传 receipt/failure.log 的边界保持。

Agent 门禁直接执行已有 `agent-gui/scripts/check-agent-offline.mjs`，包含
`tsc --noEmit --incremental false` 和显式隔离测试。测试 worker 并发上限为 Windows 2、其它平台 4，保留
15 秒文件超时，避免按宿主 CPU 数量启动大量冷 tsx worker。
实际启动 PowerShell 的发布路由与本地 MCP 文件读取 spec 另用单 worker 顺序运行，
避免与其它冷 tsx 进程竞争；它们仍完整执行，原有子进程及文件超时、断言和网络 guard 不变。
[`check-agent-regressions.mjs`](../../scripts/ci/check-agent-regressions.mjs) 复用四个既有
`test:*` 清单，拒绝 shell 片段、通配符和额外参数，并为每个套件加载相同的网络 guard。
guard 是进程内防误用检查，允许 tsx IPC，不是系统沙箱；新增测试仍须审计副作用。

Agent 矩阵另以独立步骤运行动作资源打开、Explorer watch 与 gateway guide 重定向的
owned-loopback fixture，不加载上述网络 guard。它们只绑定本次创建的 loopback 临时端口，
使用临时工作区及 fake export；验证断连后的已派发操作、watch 生命周期和固定 gateway
不跟随 HTTP 重定向。它们不访问 Quicker、用户资料或外部服务；明确列出测试并保留
15 秒文件超时，不将整套原生进程 service 测试纳入此例外。

`test:agent-eval` 检查确定性解析、fixture 与 fake harness；不会调用真实模型。
`test:authoring-benchmark` 是固定的工具选择与动作编写样例回归：用给定输入检查推荐工具、
验证提示和失败恢复是否符合当前约定；它不请求模型，也不是性能或付费评测。
benchmark 工作区中的 `.quicker` 命令与子代理是版本控制内的测试资产，不能依赖开发机
被忽略的文件。旧 docs、Agent eval unit、action-trace 工作流已合并到这条 CI。

## .NET 边界

独立的 [`Test-LinuxTransport.ps1`](../../scripts/ci/Test-LinuxTransport.ps1) 必须在 Linux
运行，只构建共享 Transport 并执行完整 `QuickerRpc.Transport.Test`；不将 Windows TFM 的
Runtime.Test 或 Console 全套搬入 Ubuntu。既有双 fake-host、完整绑定、取消和隔离合同保留。
新增用例通过生产 server factory 与客户端，在本次 GUID 管道上实际完成同 UID 的握手、
绑定和 Ping，并检查预取消不会连接。它们不证明不同 UID 的拒绝行为。

该门禁另运行强制消费 netstandard2.0 Transport 的 net10 console smoke，运行时核验
程序集 TargetFrameworkAttribute，防止误测默认 net10 产物；实际连接自有 CurrentUserOnly
对端。专用 MSBuild hook 仅在该 consumer 构建时收窄 Transport 的 restore/build 目标，
使 NuGet 图与显式 ProjectReference 一致；前面的全目标编译与 net10 合同测试不受影响。它核验
完整绑定、Ping 和零 fake 写入。Windows owner/SID/ACL 专属测试在 Ubuntu 明确
报告 unsupported。Transport 的 netstandard 目标直接声明公开会话所实现的 async interface
依赖，避免消费应用选择其它框架的传递资产时丢失该程序集版本。测试不为 smoke 单独补包。
这些 Windows 用例不能计为 Linux 覆盖；其它意外非通过结果阻断。实际测试数量和名称写入
本轮 TRX/receipt。net472 只编译，引用程序集由 SDK/NuGet 恢复，不代表在 Linux 执行了
.NET Framework，也不需要安装 Quicker。既有 Windows .NET 门禁保持原样。

[`Test-OfflineDotNet.ps1`](../../scripts/ci/Test-OfflineDotNet.ps1) 只执行明确项目，
不执行整个 solution。先检查生成知识，再禁止 MSBuild 自动生成，避免构建修复生成物
掩盖漂移。共享 Runtime/Transport 构建覆盖 net472、netstandard2.0 和 net10.0。

同一 Windows job 也执行 CLI overlay 安装的生成目录与共享文件锁 fixture：相同内容跳过，
不同内容复制失败必须向调用者抛错，额外文件保留。复制计划/源及目标 hash 在停止进程前
完成，变化文件连续复制后再校验；相同文件不覆写，零变化也不停止进程。安装 fixture 的
stop/PATH helper 替换为 fake，不改动真实安装。独立进程 fixture 验证 exact executable、
路径边界、retained handle/创建时间、退出等待及失败释放；不使用按名称、PID-only 或整树
终止兜底。serve 的假 API 覆盖陌生端口零采用、503 仅代表服务监听、迟到/消失的 listener
和失败时只回收自己创建的 child。
Windows job 另编译生成的休眠 `qkrpc.exe`，只向枚举器提供本次创建的进程，验证根路径/
兄弟/嵌套及 serve/MCP/端口隔离，最后逐一回收自己的句柄。它不枚举或终止产品进程。
Windows job 还用小型合成包运行生产 NSIS 模板的两遍真实 `/WX` 编译，固定 builder/
模板及工具 hash；直接解析第一遍 PE 提取卸载器，不执行生成 stub、setup 或卸载器。
两个历史 6010 未使用函数负控必须准确失败，编译/负控失败阻断 job，并上传本轮诊断。
这条门禁验证模板可编译，不包含完整 Electron payload、安装、快捷方式或升级语义。
真实 MCP 自动重启竞争及 Setup 升级不在该流水线，不能将离线证据记为实际升级成功。

浏览器脚本采集回归在内存中实际执行仓库脚本，避免 fake `page.evaluate` 无条件返回数组
掩盖未调用函数的问题。真实 HTTP/Edge 取消验收另用 `pnpm test:browser-runtime-live` 显式
启动，默认 skip 且不进入离线清单；仅创建自己的浏览器、profile 与 loopback 服务。

设计器 FA 的纯 port、真实 route 和旧全局缓存回归在显式离线清单内；目标/lease、取消、
迟到结果及首次全局使用时的持久缓存行为都有检查。真实组件/StepList/portal/Workspace 的
多 owner 与 legacy 组合另用 `designerFaGeometry.browser.test.ts`，不进入无浏览器二进制的 CI。

`pnpm check:action-designer` 是显式 Edge 入口，顺序运行 XProgramEditor、APDE 和工作台
文档 Host 的真实组件回归。完整 APDE 文件的正常执行已超过一分钟，文件 worker 给定
300 秒总预算；各用例内的 45/60 秒限制和服务自然退出的 5 秒门槛继续保留。
该入口不会使用真实 Quicker、模型或用户资料，也不加入无 Edge 的离线流水线。
source bundle 回归另经实际 C# CLI 读写合成源目录，沿生产 workspace API 和同一 Session
核对保存、资源、重开与晚回执；变量“+对话”回归还覆盖实际工作台、原文档 scope、
变量事务和同一 codec 的来源映射。这两份 spec 在独立的 react-server 条件进程中运行，
原客户端组件与 SDK 测试保留正常 React 条件。原生提交边界使用受控回执，不能替代真实宿主验收。
这些用例要求显式 `QKRPC_SOURCE_DOCUMENT_BIN`，缺少产物直接失败，不取用户安装版或
静默跳过。CI 按 `global.json` 构建当前提交的 Console Release 产物并注入该路径；
本地运行整套 DOM 前也须构建或指定对应隔离 CLI。此过程不安装 CLI、不重载插件。
独立的 [`Designer DOM (Windows Edge)` job](../../scripts/ci/check-designer-dom.mjs) 先实际启动镜像预装的 `msedge` 无头通道、记录
版本并关闭，再原样调用该入口；缺少浏览器或启动失败直接阻断，不下载浏览器或静默跳过。
该 job 不改变 Node/Native 门禁的测试顺序，保留所有 spec 的 individual deadline 和
300 秒文件预算；job 的 20 分钟上限同时约束准备步骤及整套顺序回归。
失败仅上传生成的 PNG 白名单、收据和最后 256 KiB 诊断；不上传 profile、trace、依赖或
整个 `.tmp`。Node 网络 guard 和页面请求拦截均保留，它们不构成 OS 网络沙箱。

独立的 `Static SPA (Windows Edge)` job 复用同一预装 Edge preflight，然后在独立进程原样
执行 `pnpm test:static-runtime`。文件 worker 给定 300 秒，完整包含原测试内既定的 240 秒
case 限制及 5 秒自然退出检查；原 60 秒外层会在慢机器尚未进入 UI 时截断合法流程。
测试会持久记录构建、验证、服务、UI/SDK 和清理的阶段耗时；case deadline、自然退出与
业务断言均不放宽。不将这条真实 loopback 集成塞入无网络门禁。服务 child 原有的本轮端口
fetch allowlist、页面 origin 拦截和生成 profile 继续负责隔离；preflight 的全 TCP 拒绝 guard
只存在于 preflight 进程，不通过 `NODE_OPTIONS` 传给 SPA 测试。
该测试沿用原构建器、staging/verifier、SDK loop 和 fake HTTP/model；后续原测试文件扩展
会自动纳入，不另复制 Agent 或用手写流程代替。失败只收顶层 PNG 和有限诊断：日志尾部
各至多 256 KiB、fixture 错误各至多 64 KiB，内容文件最多 32 个/32 MiB，另存限长清单；不上传 profile/DB、
workspace、完整 app、依赖或原始模型请求。收集器是
[`collect-static-spa-evidence.mjs`](../../scripts/ci/collect-static-spa-evidence.mjs)。

Runtime 测试显式设置 `IncludeV2HostTests=false`，移除 Plugin.V2 引用以及
composition、catalog、宿主 probe、实际编译 source 与 Designer 原语测试文件。
`DesignerUnsupportedTests` 保留在该门禁，验证可选端口缺失与预取消。独立的 V2
原语测试加载实际编译插件和明确宿主目录中的 DTO，须在本机显式运行；CI 不把它
伪装成无宿主测试。这不是 V2 插件编译验证。
V1/V2 插件、Plugin.Test 仍需合法的 Quicker 宿主引用；真实 QuickerRpc.Test 还会创建
和修改宿主动作，均不进入本流水线。也不执行热更新、安装/发布、桌面 smoke、用户数据库
迁移或真实模型评测。已有手动 live eval 与 release/deploy 工作流保持独立，不属于此离线门禁。

本地 Console 单测额外排除 `RunCheck_DetectsMissingManifest`，因为该现有测试会回退
读取当前用户 MCP 配置；脚本会明确打印排除原因。GitHub Actions 的全新 runner 完整执行
该项目，不过滤任何 Console 用例。NuGet 和编译器的既有警告保留在日志中，不用
`continue-on-error` 或删断言掩盖失败。

## 本地复现与合并门禁

从仓库根执行（Node、pnpm、.NET SDK 与 Windows .NET Framework targeting pack 已准备）：

```powershell
$env:ELECTRON_SKIP_BINARY_DOWNLOAD = '1'
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
pnpm --dir agent-gui install --frozen-lockfile
node scripts/generate-authoring-docs.mjs --check
node agent-gui/scripts/check-agent-offline.mjs
node scripts/ci/check-agent-regressions.mjs
pwsh -NoProfile -File scripts/ci/Test-OfflineDotNet.ps1
```

所有安装、类型、文档、构建和测试失败均阻断 job；矩阵不提前取消其它平台结果。
只要安装成功，扩展回归也会在显式离线检查失败后运行并报告结果，原失败仍然阻断 job。
`.NET` job 即使失败也上传已有 `.tmp/ci-results/**/*.trx`，保留 7 天。
仓库管理员可把 `Generated knowledge`、两个 `Offline Agent (...)` 和
`Host-independent .NET`、`Transport contracts (Ubuntu)`、`Designer DOM (Windows Edge)`、`Static SPA (Windows Edge)` 配成 required checks。工作流文件本身不修改分支保护；
原工作流名称的 required checks 需要相应替换。
