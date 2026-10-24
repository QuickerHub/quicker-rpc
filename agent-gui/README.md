# QuickerAgent (agent-gui)

默认生产由静态 React 界面、独立 Node Agent service 与薄 Electron 壳组成，复用
[Vercel AI SDK](https://ai-sdk.dev) 的单一执行循环，通过本机 **`qkrpc`** 与 Quicker（QuickerRpc 插件）交互。
Next 保留用于开发 HMR 和显式 legacy 生产入口。

| 文档 | 受众 |
|------|------|
| [docs/quicker-agent.md](../docs/quicker-agent.md) | 终端用户：产品介绍、下载、FAQ |
| [docs/product/README.md](../docs/product/README.md) | 产品能力、状态与规划 |
| [docs/agents/README.md](../docs/agents/README.md) | Coding Agent：任务到功能页/代码/测试的路由 |
| [DESIGN.md](DESIGN.md) | 主工作台的产品意图、体验与扩展范围 |
| 本文 | 开发者：本地运行、Electron 发布、工具一览 |
| [AGENTS.md](AGENTS.md) | Coding Agent（嵌套 [../AGENTS.md](../AGENTS.md)） |

## 前置条件

1. 需要访问 Quicker 宿主时，Quicker 已运行并已加载 QuickerRpc 插件；隔离的静态运行与 fixture 检查不要求真实宿主
2. LLM：复制 `llm-config.example.json` → `llm-config.json`，填写各 provider 的 `apiKey` / `model`（可选 `defaultProvider`；某 provider 加 `"hidden": true` 可从模型菜单隐藏）。**发布版**默认通过 `BUNDLED_LLM_BINGLEIMUZI_API_KEY` 在构建时注入混淆 Key，安装包内不含明文 Key。  
3. **开发**：Node.js 20+、pnpm  

## 默认生产运行

以下命令在 `agent-gui/` 执行：

| 命令 | 行为 |
|---|---|
| `pnpm build` | 生成编写文档、核对 API manifest、独立 TypeScript 检查，然后构建静态 React/Node 到 `../.tmp/static-runtime/app` |
| `pnpm start` | 在原 Node 进程加载上述静态产物；先校验产物，固定生产模式，再启动服务 |
| `pnpm electron:prepare` | 默认重新构建静态 app，并暂存 app、工具与薄壳到 `electron/resources` / `electron/shell-app` |
| `pnpm electron:build` | 默认静态 prepare 后构建 NSIS 安装包并检查 app.asar |

生产 `start` 接受 `--host`、`--port`、`--data-dir` 和 `--app-dir=<directory>`，不再预先启动
Next 或 qkrpc。验收时使用显式资料目录与临时端口，例如：

```powershell
pnpm build
pnpm start --port 0 --data-dir D:\AgentProfiles\production-check
```

`pnpm build:static` / `build:static:dev` 保留为底层构建与开发检查入口，不替代默认生产构建的
前置检查；`electron:prepare:static` 保留为静态 prepare 的兼容入口。静态构建不改 `.next`，
日常 `dev.ps1` / `:3000` 的 Next HMR 保留。

Next 生产路径必须显式选择：

```powershell
pnpm build:legacy-next
pnpm electron:prepare:legacy-next
pnpm start:legacy-next
# 完整 legacy 安装包入口：pnpm electron:build:legacy-next
```

legacy `start` 默认加载完整的 `agent-gui/electron/resources/app`，不直接运行缺少静态/public
资源的原始 `.next/standalone`。它使用 `HOSTNAME`、`PORT` 与 `QUICKER_AGENT_DATA_DIR`，
不接受静态服务的 CLI 参数；未指定主机时默认 loopback。

当前 shell 的模式元数据与产物的 `runtime-mode.json` 一起约束选择。模式不匹配或静态入口
缺失时，在服务端口和后端子进程启动前明确失败，不从遗留 `server.js` 或旧静态文件自动回退。
模式标记不保证产物新鲜度，也不提供事务式升级。

`pnpm test:static-runtime` 使用搬移后的产物、生成资料、fake 模型与独立 Edge，验证 API、
界面及真实 browser/terminal 子进程。完整资源清单和剩余安装/升级、真实用户资料、宿主业务
验收边界见 [静态运行目录](../docs/engineering/static-agent-runtime.md)；默认入口切换不表示这些验收已全部完成。

## 开发（统一入口）

动作设计器回归：`pnpm check:agent-offline` 包含文档 revision、保真序列化和真实临时磁盘
链；`pnpm check:action-designer` 使用已安装的 Microsoft Edge 验证真实 React 编辑器。
后者禁止浏览器网络请求，使用合成动作和 fake 文件/宿主边界，无需模型或运行中的 Quicker。

仓库根目录 **只用一个启动脚本**：

```powershell
cd quicker-rpc

# 首次或改 Plugin/CLI 后（可选；dev.ps1 也会在需要时 bootstrap）
pwsh ./build.ps1 -t

# 复制 LLM 配置（首次）
copy agent-gui\llm-config.example.json agent-gui\llm-config.json

# 全栈日常开发：qkrpc serve + 浏览器 UI @ :3000
pwsh ./dev.ps1

# 桌面 QuickerAgent 窗口（Electron Chromium；复用已运行的 :3000 前端）
pwsh ./dev.ps1 -Electron
```

| 模式 | 命令 | 说明 |
|------|------|------|
| Web 前端（默认） | `pwsh ./dev.ps1` | qkrpc + agent-gui，Turbopack HMR；加 `-Browser` 自动打开浏览器 |
| 桌面壳 (Electron) | `pwsh ./dev.ps1 -Electron` | 先跑默认模式，再开 Electron 复用前端 |
| 桌面壳 (Tauri, legacy) | `pwsh ./dev.ps1 -Tauri` | WebView2 试验壳 |
| 仅 qkrpc | `pwsh ./dev.ps1 -Services qkrpc` | 只要后端 serve |

常用参数：`-Browser` 自动打开浏览器；`-NoWatch` 关闭自动热更。默认保存 Plugin/CLI 后自动 `build.ps1 -t` 并重启 serve。详见 [docs/dev-supervisor-design.md](../docs/dev-supervisor-design.md)。

**不要同时跑** 两个占 `:3000` 的 agent 实例。桌面壳与浏览器 dev 切换时脚本会清 `.next`，避免 Turbopack/webpack 混用报错。

`package.json` 里的 `pnpm dev` / `electron:dev` 等由 `dev.ps1` 内部调用，日常不必手敲。

**默认工作目录**：侧栏留空时，开发环境为 **quicker-rpc 仓库根**；安装版为 **`Documents/QuickerAgent/workspace`**。用户数据与安装资源：[`docs/agent-gui-plugin-storage.md`](../docs/agent-gui-plugin-storage.md)。**对话存储**：[`docs/agent-gui-chat-storage.md`](../docs/agent-gui-chat-storage.md)。**快速输入启动器**：[`docs/agent-gui-launcher.md`](../docs/agent-gui-launcher.md)。

## 工作台开发入口

主界面采用 Quicker V2 Agent 工作台的深浅主题与布局，产品约定先读 [DESIGN.md](DESIGN.md)。

| 修改内容 | 入口 |
|---|---|
| 外壳、会话布局组合 | `components/shell/AgentWorkbenchShell.tsx`：`AgentWorkbenchShell` / `AgentConversationFrame` |
| 主工作台主题与尺寸 | `app/theme.css` 的 `--workbench-*`、`app/agent-workbench.css` 的 `.agent-workbench` |
| 输入区快捷入口定义 | `lib/agent-workbench-features.ts` |
| 入口图标与实际操作绑定 | `components/chat/ComposerShortcutCards.tsx` |
| 会话与面板组合 | `components/chat/Chat.tsx` |

这些入口负责展示，工具执行、权限和持久化沿用现有 harness。分层与 DSH 参考边界见 [Agent 架构](../docs/agent-architecture.md#工作台组合边界)。仅改 UI 时使用开发服务器与 HMR，按 [AGENTS.md](AGENTS.md) 完成前端检查。

## 独立 Node 服务与数据根

`service/main.ts` 是共享 Node 应用的源码入口，默认生产构建将它与静态 renderer 一起暂存。
HTTP/SSE、聊天、设置、历史、workspace 与 Designer API 沿用同一 manifest 和原有 handlers、
runner、AI SDK loop；不另建 API 或持久化实现。`GET /health` 不加载配置/DB，业务 API 按需
初始化 runtime。直接运行源码仍可用于服务开发，日常界面开发继续用 `dev.ps1` 的 HMR。

```powershell
cd agent-gui
pnpm dev:agent-service --help
pnpm dev:agent-service --data-dir D:\AgentProfiles\designer-dev
pnpm check:agent-backend      # 只检查依赖图，不执行产物
pnpm check:agent-offline      # 类型检查 + 显式 fake/fixture 清单
pnpm test:agent-service       # 自有 loopback + fake SDK 工具/审批 + 隔离 CLI/SQLite fixture
```

服务默认绑定 `127.0.0.1:0`，在 stdout 输出实际 origin；仅支持 loopback。
`--data-dir` 优先于 `QUICKER_AGENT_DATA_DIR`，两者都要求绝对路径；不设置时保留原系统默认。
显式目录只使用该资料根，不自动发现或导入默认 AppData、安装目录与旧 WebView 历史。
同一进程选择后固定，切换需重启。安装资源、SQL migrations 与 bundled 配置仍从资源根读取。
Next 与 Node 现在共用 SQLite writer lease：第二个新版进程在迁移/写入前明确拒绝；
正常关闭或进程崩溃后可重新取得租约。细节与旧版进程限制见 [对话存储](../docs/agent-gui-chat-storage.md)。

默认 Electron 生产 prepare 已接入同一静态运行目录；切换默认入口不改变用户资料格式或宿主能力。
显式 profile 和单 writer 已有生成资料/真实子进程验证，不能代替真实旧资料迁移、安装/升级
或完整宿主工作流验收。架构、停止顺序和未完成门槛见
[框架去耦与目标运行边界](../docs/agent-architecture.md#框架去耦与目标运行边界)。

## 发布（Electron）

```powershell
# 仓库根目录 — 正式 Windows 安装包 + latest.yml
pnpm quicker-agent:publish

# 或
pwsh ./publish/Publish-QuickerAgent.ps1
```

发布和本地预检默认都选择静态 React/Node；本地预检不编 NSIS：
`pwsh ./publish/Preflight-QuickerAgentBuild.ps1`。需要 legacy 时显式传 `-RuntimeMode legacy-next`。

`-SkipAppBuild`（旧名 `-SkipNextBuild`）只跳过所选模式的 app 构建，不选择 Next 模式：
静态模式会先验证并复用 `electron/resources/app`；legacy 模式省略 `build:legacy-next`，
但仍从已有 `.next/standalone` 重新暂存完整 app。启动 legacy 仍使用上述 staged 路径。

```powershell
cd agent-gui
pnpm electron:check
pnpm electron:prepare         # 默认静态生产构建 + staging
pnpm electron:verify-bundle   # staged resources only
pnpm electron:build           # 重新 prepare 后构建 NSIS → electron/dist/
```

Agent 分层见 [`docs/agent-architecture.md`](../docs/agent-architecture.md)；桌面打包以本节命令和 `scripts/electron-*.mjs` 校验为准。
