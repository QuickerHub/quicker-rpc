# QuickerAgent (agent-gui)

基于 [Vercel AI SDK](https://ai-sdk.dev) 的聊天界面，通过本机 **`qkrpc`** 与 Quicker（QuickerRpc 插件）交互。

| 文档 | 受众 |
|------|------|
| [docs/quicker-agent.md](../docs/quicker-agent.md) | 终端用户：产品介绍、下载、FAQ |
| 本文 | 开发者：本地运行、Tauri 发布、工具一览 |
| [AGENTS.md](AGENTS.md) | Coding Agent（嵌套 [../AGENTS.md](../AGENTS.md)） |

## 前置条件

1. Quicker 已运行，并已加载 QuickerRpc 插件  
2. LLM：复制 `llm-config.example.json` → `llm-config.json`，填写各 provider 的 `apiKey` / `model`（可选 `defaultProvider`；某 provider 加 `"hidden": true` 可从模型菜单隐藏）。**Tauri 发布版**默认通过 `BUNDLED_LLM_BINGLEIMUZI_API_KEY` 在构建时注入混淆 Key，安装包内不含明文 Key。  
3. **开发**：Node.js 20+、pnpm、Rust（仅 Tauri 需要）  

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

# 桌面 QuickerAgent 窗口（WebView2；复用已运行的 :3000 前端）
pwsh ./dev.ps1 -Tauri

# 桌面 QuickerAgent 窗口（Electron Chromium；实验壳，IPC 迁移中）
pwsh ./dev.ps1 -Electron
```

| 模式 | 命令 | 说明 |
|------|------|------|
| 浏览器（默认） | `pwsh ./dev.ps1` | qkrpc + agent-gui，Turbopack HMR |
| 桌面壳 (Tauri) | `pwsh ./dev.ps1 -Tauri` | 先跑默认模式，再开 Tauri 复用前端 |
| 桌面壳 (Electron) | `pwsh ./dev.ps1 -Electron` | 实验 Chromium 壳；正式发布仍用 Tauri |
| 仅 qkrpc | `pwsh ./dev.ps1 -Services qkrpc` | 只要后端 serve |

常用参数：`-Browser` 自动打开浏览器；`-Full` 启动时加载语音 runtime；`-NoWatch` 关闭自动热更。默认保存 Plugin/CLI 后自动 `build.ps1 -t` 并重启 serve。详见 [docs/dev-supervisor-design.md](../docs/dev-supervisor-design.md)。

**不要同时跑** 两个占 `:3000` 的 agent 实例。Tauri 与浏览器 dev 切换时脚本会清 `.next`，避免 Turbopack/webpack 混用报错。

`package.json` 里的 `pnpm dev` / `tauri:dev` 等由 `dev.ps1` 内部调用，日常不必手敲。

**默认工作目录**：侧栏留空时，开发环境为 **quicker-rpc 仓库根**；Tauri 安装版为 **`Documents/QuickerAgent/workspace`**。插件与资源存储：[`docs/agent-gui-plugin-storage.md`](../docs/agent-gui-plugin-storage.md)。**对话历史 JSON**：[`docs/agent-gui-chat-storage.md`](../docs/agent-gui-chat-storage.md)。**快速输入启动器**：[`docs/agent-gui-launcher.md`](../docs/agent-gui-launcher.md)。**启动性能**：[`docs/agent-gui-startup-performance.md`](../docs/agent-gui-startup-performance.md)。

## 发布（Tauri 2）

```powershell
# 仓库根目录 — 正式 Windows 安装包
pnpm quicker-agent:publish
```

## 打包（Electron，实验）

与 Tauri 共享 `resources/` 布局（Next standalone + Node + qkrpc）。**非正式发布渠道**。

```powershell
cd agent-gui
pnpm build
pnpm electron:build          # NSIS → electron/dist/
pnpm electron:verify-bundle  # 仅校验 staged resources

# 或仓库根目录
pwsh ./publish/Publish-QuickerAgent-Electron.ps1
```

设计说明：`docs/superpowers/specs/2026-06-11-agent-gui-electron-packaging-design.md`
