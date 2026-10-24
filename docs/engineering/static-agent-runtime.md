# 静态 React 与 Node 运行目录

本入口复用现有 React 组件、AI SDK runner、工具表和 SQLite，不创建另一套 Agent 或数据格式。
产品切换状态与删除兼容宿主的门槛以 [A4/C4](../product/README.md#refactor-execution-plan) 为准。

## 构建与启动

在 `agent-gui/` 执行：

```powershell
pnpm install --frozen-lockfile
pnpm check:service-routes
pnpm build:static
node ../.tmp/static-runtime/app/service.mjs --port 0 --data-dir <absolute-profile-directory>
```

静态 renderer 由已安装的 esbuild 编译，无需 Next 或新的构建工具依赖。
`build:static:dev` 生成带开发检查入口的静态页面。日常 `dev.ps1` / `:3000` HMR 保留，
静态构建不读取或改写 `.next`。构建只接受仓库内明确输出目录；默认输出在 `.tmp/`。
每次先生成新目录，再替换已识别的产物，失败保留旧产物；含数据库或 `.local` 的目录拒绝替换。
renderer 图拒绝 server/DB/Next 模块，backend 图拒绝 Next、`server-only` 和本地 alias 残留。
打包保留运行时 npm 依赖的实际版本冲突，资源不依赖开发目录中的 junction 或绝对路径。

启动返回一行 `agent-service-ready` JSON，包含实际 loopback origin。
`/health` 与静态页面不打开数据库或加载模型配置。`--data-dir` 继续使用既有 profile 与
单 writer lease；未指定时使用现有系统默认目录。显式 profile 不导入其它用户目录。
一个服务进程持有一个 runtime，API 和 chat 共享同一 DB owner。

## API 与 renderer 清单

路由事实源是 [`api-routes.generated.ts`](../../agent-gui/lib/agent-service/api-routes.generated.ts)。
生成器读取现有 `app/api/**/route.ts` 的路径和方法；`check:service-routes` 拒绝漂移。
当前 71 个 API handler 加上 application 的 `/api/chat`，均使用标准 Request/Response。
不复制 workspace/Designer 的保存实现；P1 后续修改原 handler 即由两个宿主共同消费。

| 领域组 | 原有入口 | Node 适配行为 |
|---|---|---|
| Chat / history | `chat`、title/compact、chat-store、thread messages、migrate、chat-export | 原 AI SDK SSE、审批往返、断连信号和历史格式 |
| Settings / LLM | `settings/*`、`llm`、usage | 同一 SQLite 配置；preview Cookie 从显式 Request 读取 |
| Agent 资产 | `agent-defs`、`docs`、topic/reference 动态路径 | 原 discovery、分页正文与资源路径 |
| Workspace / Designer | `workspace`、watch/action-sync、designer、actions、subprogram、step-runner、icons/fa、clipboard 特殊格式 | 原 handler、cwd/abort ALS、结构化失败；不扩大宿主能力 |
| 工具与运行时 | `tools/execute`、shell、browser、terminal | 原执行和审批策略、流式 Response、进程 owner |
| 开发入口 | `dev/*`、cursor-sdk | 保留生产门控；生产静态页不加载 Cursor SDK runtime |

动态路由参数保留原 Promise 形式。未知路径返回 404，不打开 runtime；方法不支持返回
405/Allow；SSE body 由现有 Node adapter 处理背压和断连。
`/ActionDesignerIcons/*` 保留原 rewrite 到 icons API。

静态页面为 `/`、`/launcher`、`/bench`、`/tool-test` 和开发态 `/cursor-sdk`，Designer embed
沿用首页 URL 参数。页面只公开 `renderer/` 内文件，校验解码路径和 realpath，拒绝隐藏文件、
目录跳转及 symlink 越界；支持 HEAD、ETag 和 MIME。主页面启动遮罩与 Launcher 的透明初始化
分别按原生命周期运行。内部页面链接使用普通浏览器导航。

## 随包布局与生命周期

| 路径（相对 resources） | 用途 |
|---|---|
| `app/service.mjs`、`app/lib/service-main.mjs`、`runtime-manifest.json` | bootstrap、唯一业务组合、版本化运行格式 |
| `app/renderer/` | 静态 React、CSS、public 与 hash 资源 |
| `app/drizzle/migrations/` | 原数据库迁移与 journal |
| `app/docs/skills/`、`app/docs/authoring-references/`、`app/lib/agent-defs/bundled/` | 随包知识、reference、commands/agents |
| `app/browser-runtime/`、`app/terminal-runtime/`、`app/lib/*.mjs` | 运行时子进程及其模块 |
| `app/node_modules/` | 独立 npm 图，包括 SQLite、pty、WebSocket、Playwright |
| `node/`、`qkrpc/`、`rg/` | portable Node、完整 CLI runtime 与 ripgrep |

普通静态构建不复制任何 LLM 配置。`electron:prepare:static` 沿用现有显式发布配置与 cipher
pepper 的生成步骤；需要发布的配置由原发布流程提供，不复制用户 DB 或 `.local`。
可用 `STATIC_RUNTIME_QKRPC_DIR` 指定已离线构建的完整 CLI 目录；不安装或重载它。
`verify-static-runtime.mjs` 用目标 Node 验证原生 SQLite/pty，以及资源和依赖的可移动性。
`verify-desktop-bundle.mjs` 同时识别新 manifest 和旧 Next staging。

Node service 为 browser/terminal 分配独立端口和 owner，状态写入选定 profile 的 `runtime/`。
相同版本但不同 owner 也拒绝复用；占用端口或旧磁盘 PID 不构成杀进程的授权。
只回收实际登记并保有 child handle 的进程。正常退出通过 IPC，父 IPC 断连也触发停止；
Windows fallback 不阻塞观察 exit 的 event loop。清理失败保留 owner 并报错。后台发布配置刷新同样由服务持有，停止时取消并等待所有刷新，
再关闭数据库；晚到的响应不能重开存储。
Explorer 的 workspace watch 同样归当前 runtime：停止时关闭其 watcher、清除 debounce/idle
timer，并等待尚未结束的树读取，晚回调不能重新发布或调度。正常 SSE 退订仍保留原有
30 秒 idle 缓存；另一个 runtime owner 和 Next 兼容入口的缓存各自独立，不随之释放。
Electron 重复退出/升级调用等待同一个 shutdown Promise，先排空 Node，再清理所属 qkrpc；
复用的外部 qkrpc 不属于这个 shell。

Electron 的 Windows fallback 同样使用异步、有界的 `taskkill`，实际 child exit 后才完成；
helper 成功不冒充进程已退出。超时保留 backend handle 供重试，晚到的 IPC 错误不能再次
终止已退出的进程。对应离线 fixture 覆盖 event loop 可推进、超时、真实 exit 和晚回调。

## 验证与切换边界

```powershell
pnpm check:agent-offline
pnpm test:agent-service
pnpm test:static-runtime
pnpm check:action-designer
pnpm electron:check
pnpm electron:prepare:static
node scripts/build-electron-installer.mjs --win nsis --publish never --config.directories.output=../.tmp/static-electron-dist
pwsh -File scripts/Test-QuickerAgentElectronSmoke.ps1 -Action full -DistDir ../.tmp/static-electron-dist
```

`test:static-runtime` 从全新目录构建并搬移产物，使用生成 profile/workspace、loopback fake
模型与 qkrpc、独立 Edge context；验证生产 runner 的 SSE、历史、设置、workspace、Designer、
docs/skills、真实 browser/terminal 子进程启动与 IPC 断连回收，以及页面、设置、深浅/窄窗
和开发态 frontend check。fixture 的出站请求受限，不接真实模型或 Quicker。
集成 fixture 还通过已搬移产物的真实 HTTP `save-program-document` 入口验证正文及属性落盘、
Int64/高精度字段保真、过期 baseline 返回 409 且不覆盖文件；普通保存不调用宿主。
审批/续跑和停止另由 `test:agent-service` 使用 fake model + 原 SDK loop 验证。
真实浏览器与原生模块测试是显式入口，不悄悄加入无浏览器的 CI。

live 文档 fixture 还走完整 SPA：Explorer 打开动作，保留未 blur 人工备注，通过真实
“+对话”入口授权并发送；fake 模型经原 SDK read/edit 调用原 APDE，切文件不改变目标，
回执保持未保存，一次 undo 恢复人工内容，正文/属性磁盘 hash 不变。展开 Explorer 后的
watcher 曾使整个测试退出失败；接入 runtime 所属 watcher/timer/pending read 清理后，
完整 SPA 已复验通过，Node 自然退出 85ms，未触发强制回收，保留原 5 秒门槛。

打包 smoke 使用原 Windows Job Object 隔离协议，所有 RPC 都被本轮 guard 拒绝。
它验证打包产物与所属进程的启动，不能代替 NSIS 安装/升级、真实旧用户资料升级、
V1/V2 专用动作写回或完整新版 Designer 与 Agent 协同。

NSIS 两条正式打包入口共用固定版本模板适配与 .NET Framework 4.7.2 ownership helper。
构建必须经过上述入口；原始 builder 调用缺少适配标记时拒绝生成安装器。最终安装目录、
产品注册身份与程序路径先于关闭请求核验；只有精确根程序接收有界 WM_CLOSE，其它程序
仅作为阻塞项观察。同目录已识别产品采用 overlay，保留用户资料，不执行旧卸载器；
目录迁移、身份不明、case-sensitive/重定向/云端占位路径或仍运行的程序明确拒绝。
包与现有目标共用程序资源分类，用户 local/plugins/cache 目录不进入覆盖或递归检查。
Overlay 会保留过时程序文件，部分复制失败也不具有事务回滚语义。
Windows CI 编译生产 helper 并运行纯进程策略 fixture；它不会运行安装器或关闭应用。
专属隐藏窗口 fixture 已验证精确根程序关闭、同名外部进程隔离和后端阻塞，
唯一测试身份的隔离安装/升级已有下述实测，真实旧资料仍待验收。

独立的 [NSIS fixture 入口](../../agent-gui/scripts/prepare-nsis-fixture.mjs) 复用上述真实 builder、
静态 runtime 与 Electron shell，只使用明确提供并核验过的 CLI、ripgrep 和本地工具缓存。
它不调用嵌入发布密钥的 prepare 链；依赖从已安装的生产依赖图离线复制，`prepare` 只初始化
新的仓库 `.tmp` 目录，目录已存在时拒绝重新初始化。共享 shell staging 在创建输出前核验真实祖先，
拒绝 junction/symlink 将新子目录重定向到仓库外。

fixture 使用唯一 appId/GUID/productName、固定安装目录和合成资料；固定版本模板适配编译
排除全部快捷方式写删、自动启动及用户 AppData 删除，并将安装器缓存放进本轮目录。
`audit --version=0.0.1` 运行真实打包并在编译前保留 NSIS 预处理结果；
`build --version=0.0.1` / `build --version=0.0.2` 保留 builder 原有两 pass 和签名入口，
其中会执行仅负责写出本轮卸载器的受限生成 stub。最终 setup 与真正卸载器不由此入口运行。
NSIS 3.0.4.1 的 `/PPO` 插件查找使用独立 parser 工具副本，来源与插件 hash 保留在 provenance；
真实编译器及脚本不使用该解析副本。已删除目录回调与旧卸载链留下的无用函数，保留 `/WX`。

唯一身份下的两版真实 NSIS 制品已通过 `/WX` 构建，产物有版本、大小与 SHA-256 收据；
本地 fixture 没有签名凭据，不能将保留签名入口写成制品已签名。长 TEMP 的首次尝试
缺少 249 个超过路径上限的解包文件；短 TEMP 尝试虽完整解包，复制仍被原 180 秒时限
回收，两次均保留为失败证据。runner 改为 setup 专属短 TEMP/TMP、600 秒有界等待和
30 秒进度报告后，首次安装与同目录 0.0.1→0.0.2 升级实际通过；两版各 7212 个程序文件
逐一核对大小与 SHA-256，注册身份/版本及合成数据库、插件/缓存哨兵核验通过。
制品 GUI 构建源为 `9f76f2ce`，早于最新主线；本项证明安装链，不代表最新 GUI 打包验收。
升级后的已安装程序也使用独立合成 profile 与 owned Job 启动通过；专属 UI ready、RPC guard
返回 `SMOKE_HOST_RPC_DISABLED` 和所属进程回收均已核验，不访问真实宿主。

[验收脚本](../../agent-gui/scripts/Test-IsolatedNsisAcceptance.ps1) 默认 `-Action Plan` 只读输出
身份与命令；`Fresh`、`Upgrade`、`Launch`、`Verify` 必须显式运行。它复用现有 owned Job、
合成 profile 与 RPC guard；setup 的短 TEMP 不改变 Electron smoke 的资料映射。
真实 setup、原生窗口与桌面 smoke 不加入自动离线清单；CI 有模板/参数/路径策略纯测试及
小型合成包的两遍 `/WX` 编译，直接解析 PE 提取卸载器，不运行生成程序。
上述首次安装、原目录升级、完整 payload hash 与合成资料保留
已有隔离实测；生产快捷方式、真正卸载及真实旧资料仍是独立验收门槛。

浏览器单次调用现已把 turn abortSignal 传到独立 request owner 与按 session 串行的原生
操作尾部，实际自建 Edge/HTTP 取消、排队、迟到结果及原 context/ref 复用另有验证；
Electron 原生与用户浏览器继续独立验收，不能用服务退出代替。以上门槛完成前，保留
Next 开发与兼容打包入口；新静态产物本身不含 Next。
