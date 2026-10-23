# QuickerAgent (agent-gui)

基于 [Vercel AI SDK](https://ai-sdk.dev) 的聊天界面，通过本机 **`qkrpc`** 与 Quicker（QuickerRpc 插件）交互。

| 文档 | 受众 |
|------|------|
| [docs/quicker-agent.md](../docs/quicker-agent.md) | 终端用户：产品介绍、下载、FAQ |
| [docs/product/README.md](../docs/product/README.md) | 产品能力、状态与规划 |
| [docs/agents/README.md](../docs/agents/README.md) | Coding Agent：任务到功能页/代码/测试的路由 |
| [DESIGN.md](DESIGN.md) | 主工作台的产品意图、体验与扩展范围 |
| 本文 | 开发者：本地运行、Electron 发布、工具一览 |
| [AGENTS.md](AGENTS.md) | Coding Agent（嵌套 [../AGENTS.md](../AGENTS.md)） |

## 前置条件

1. Quicker 已运行，并已加载 QuickerRpc 插件  
2. LLM：复制 `llm-config.example.json` → `llm-config.json`，填写各 provider 的 `apiKey` / `model`（可选 `defaultProvider`；某 provider 加 `"hidden": true` 可从模型菜单隐藏）。**发布版**默认通过 `BUNDLED_LLM_BINGLEIMUZI_API_KEY` 在构建时注入混淆 Key，安装包内不含明文 Key。  
3. **开发**：Node.js 20+、pnpm  

## 开发（统一入口）

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
| 浏览器（默认） | `pwsh ./dev.ps1` | qkrpc + agent-gui，Turbopack HMR |
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

## 独立 Agent 服务（实验性）

`service/main.ts` 提供脱离 Next 的 Node 开发入口；现有桌面壳和日常开发继续使用上面的
`dev.ps1`。目前只实现 `GET /health` 与 `POST /api/chat`，复用原 runner、AI SDK loop
和 HTTP/SSE 消息格式。健康检查不加载配置/DB；聊天时才初始化真实适配器。

```powershell
cd agent-gui
pnpm dev:agent-service --help
pnpm check:agent-backend      # 只检查依赖图，不执行产物
pnpm check:agent-offline      # 类型检查 + 显式 fake/fixture 清单
pnpm test:agent-service       # 自有 loopback + fake SDK 工具/审批 + 隔离 CLI/SQLite fixture
```

服务默认绑定 `127.0.0.1:0`，在 stdout 输出实际 origin；仅支持 loopback。
该源码入口尚未并入 Electron 包，也没有完成所有 API、数据根/单 writer 和资源布局迁移。
只供受控开发验证，不与现有壳共享真实用户资料作迁移验收。架构、停止顺序和未完成门槛见
[框架去耦与目标运行边界](../docs/agent-architecture.md#框架去耦与目标运行边界)。

## 发布（Electron）

```powershell
# 仓库根目录 — 正式 Windows 安装包 + latest.yml
pnpm quicker-agent:publish

# 或
pwsh ./publish/Publish-QuickerAgent.ps1
```

本地预检（不编 NSIS）：`pwsh ./publish/Preflight-QuickerAgentBuild.ps1`

```powershell
cd agent-gui
pnpm electron:check
pnpm build
pnpm electron:verify-bundle   # staged resources only
pnpm electron:build           # NSIS → electron/dist/
```

Agent 分层见 [`docs/agent-architecture.md`](../docs/agent-architecture.md)；桌面打包以本节命令和 `scripts/electron-*.mjs` 校验为准。
