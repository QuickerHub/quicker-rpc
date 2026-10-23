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
Windows fallback 不阻塞观察 exit 的 event loop。清理失败保留 owner 并报错。
Electron 重复退出/升级调用等待同一个 shutdown Promise，先排空 Node，再清理所属 qkrpc；
复用的外部 qkrpc 不属于这个 shell。

## 验证与切换边界

```powershell
pnpm check:agent-offline
pnpm test:agent-service
pnpm test:static-runtime
pnpm check:action-designer
pnpm electron:check
pnpm electron:prepare:static
pnpm exec electron-builder --win nsis --publish never -c.directories.output=../.tmp/static-electron-dist
pwsh -File scripts/Test-QuickerAgentElectronSmoke.ps1 -Action full -DistDir ../.tmp/static-electron-dist
```

`test:static-runtime` 从全新目录构建并搬移产物，使用生成 profile/workspace、loopback fake
模型与 qkrpc、独立 Edge context；验证生产 runner 的 SSE、历史、设置、workspace、Designer、
docs/skills、真实 browser/terminal 子进程启动与 IPC 断连回收，以及页面、设置、深浅/窄窗
和开发态 frontend check。fixture 的出站请求受限，不接真实模型或 Quicker。
审批/续跑和停止另由 `test:agent-service` 使用 fake model + 原 SDK loop 验证。
真实浏览器与原生模块测试是显式入口，不悄悄加入无浏览器的 CI。

打包 smoke 使用原 Windows Job Object 隔离协议，所有 RPC 都被本轮 guard 拒绝。
它验证打包产物与所属进程的启动，不能代替 NSIS 安装/升级、真实旧用户资料升级、
V1/V2 专用动作写回或完整新版 Designer 与 Agent 协同。
浏览器单次工具调用的 turn abortSignal 仍未贯穿到 runtime 中的实际页面操作，不能用服务退出
验证代替这条 R2 验收。以上门槛完成前，保留 Next 开发与兼容打包入口；新静态产物本身不含 Next。
