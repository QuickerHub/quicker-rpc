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
| Host-independent .NET | Windows / `global.json` SDK | Runtime/Transport 全目标框架构建；Console、Transport、fake-host Runtime 单测；保留 TRX |

安装使用 `pnpm install --frozen-lockfile`，缓存仅包含 pnpm store，不跨平台复用
`node_modules`。保留原生模块构建，因为 SQLite fixture 需要 `better-sqlite3`；仅跳过
Electron 和 Playwright 二进制下载。Node 22 跟随维护补丁，依赖图由现有锁文件固定。
.NET 使用现有中央包版本；目前没有 NuGet lock 文件，不能声称其传递依赖已锁定。

Agent 门禁直接执行已有 `agent-gui/scripts/check-agent-offline.mjs`，包含
`tsc --noEmit --incremental false` 和显式隔离测试。测试 worker 并发限制为 4，保留
15 秒文件超时，避免按宿主 CPU 数量启动大量冷 tsx worker。
[`check-agent-regressions.mjs`](../../scripts/ci/check-agent-regressions.mjs) 复用四个既有
`test:*` 清单，拒绝 shell 片段、通配符和额外参数，并为每个套件加载相同的网络 guard。
guard 是进程内防误用检查，允许 tsx IPC，不是系统沙箱；新增测试仍须审计副作用。

Agent 矩阵另以独立步骤运行动作资源打开的 owned-loopback 生命周期 fixture，不加载上述
网络 guard。它只绑定本次创建的 loopback 临时端口并使用临时工作区及 fake export，验证
客户端断连后服务仍登记并等待已派发操作；不访问 Quicker、用户资料或外部服务。该步骤
固定单个 integration test 与 15 秒超时，不将整套原生进程 service 测试纳入此例外。

`test:agent-eval` 检查确定性解析、fixture 与 fake harness；不会调用真实模型。
`test:authoring-benchmark` 是固定的工具选择与动作编写样例回归：用给定输入检查推荐工具、
验证提示和失败恢复是否符合当前约定；它不请求模型，也不是性能或付费评测。
benchmark 工作区中的 `.quicker` 命令与子代理是版本控制内的测试资产，不能依赖开发机
被忽略的文件。旧 docs、Agent eval unit、action-trace 工作流已合并到这条 CI。

## .NET 边界

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
真实 MCP 自动重启竞争及 Setup 升级不在该流水线，不能将离线证据记为实际升级成功。

浏览器脚本采集回归在内存中实际执行仓库脚本，避免 fake `page.evaluate` 无条件返回数组
掩盖未调用函数的问题。真实 HTTP/Edge 取消验收另用 `pnpm test:browser-runtime-live` 显式
启动，默认 skip 且不进入离线清单；仅创建自己的浏览器、profile 与 loopback 服务。

设计器 FA 的纯 port、真实 route 和旧全局缓存回归在显式离线清单内；目标/lease、取消、
迟到结果及首次全局使用时的持久缓存行为都有检查。真实组件/StepList/portal/Workspace 的
多 owner 与 legacy 组合另用 `designerFaGeometry.browser.test.ts`，不进入无浏览器二进制的 CI。

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
`Host-independent .NET` 配成 required checks。工作流文件本身不修改分支保护；
原工作流名称的 required checks 需要相应替换。
