# QuickerAgent (agent-gui)

基于 [Vercel AI SDK](https://ai-sdk.dev) 的聊天界面，通过本机 **`qkrpc`** 与 Quicker（QuickerRpc 插件）交互。

**Coding agent 约定**：[AGENTS.md](AGENTS.md)（嵌套于仓库根 [AGENTS.md](../AGENTS.md)）。

## 前置条件

1. Quicker 已运行，并已加载 QuickerRpc 插件（仓库根目录 `pwsh ./build.ps1 -t` 会自动重载插件并启动 `qkrpc serve`）  
2. LLM：复制 `llm-config.example.json` → `llm-config.json`，填写各 provider 的 `apiKey` / `model`（可选 `defaultProvider`；某 provider 加 `"hidden": true` 可从模型菜单隐藏）。**Tauri 发布版**默认通过 `BUNDLED_LLM_BINGLEIMUZI_API_KEY` 在构建时注入混淆 Key，安装包内不含明文 Key。  
3. **开发**：Node.js 20+、pnpm、Rust（仅 Tauri 需要）  

## 开发（两种模式，二选一）

```powershell
# 0. 一次性：构建插件 + CLI（Quicker 需已运行）
cd quicker-rpc
pwsh ./build.ps1 -t

# 1. 复制 LLM 配置（首次）
copy agent-gui\llm-config.example.json agent-gui\llm-config.json

# 2a. 浏览器里改 UI（Turbopack，快）
pwsh ./start-agent-gui.ps1

# 2b. 桌面 QuickerAgent 窗口（webpack + WebView2）
pwsh ./start-agent-gui.ps1 -Tauri
```

| 模式 | 命令 | 编译器 | 用途 |
|------|------|--------|------|
| 浏览器 | `start-agent-gui.ps1` | Turbopack | 日常改 UI、HMR 快 |
| 桌面壳 | `start-agent-gui.ps1 -Tauri` | webpack | 测 WebView2、托盘、语音插件 |

**不要同时跑两种模式**（都占 `:3000`）。切换时脚本会自动清 `.next`，避免 Turbopack/webpack 混用报错。

可选：`start-agent-gui.ps1 -Browser` 自动打开浏览器；`-Full` 启动时加载语音 runtime。高级脚本仍在 `package.json`（`dev:webpack`、`tauri:dev` 等），日常只用上面两条即可。

**默认工作目录**：侧栏留空时，开发环境为 **quicker-rpc 仓库根**；Tauri 安装版为 **`Documents/QuickerAgent/workspace`**。插件与资源存储：[`docs/agent-gui-plugin-storage.md`](../docs/agent-gui-plugin-storage.md)。**对话历史 JSON**：[`docs/agent-gui-chat-storage.md`](../docs/agent-gui-chat-storage.md)。

## 发布（Tauri 2）

```powershell
# 仓库根目录
pnpm quicker-agent:publish
```

流程：`pnpm build` → `scripts/tauri-prepare.mjs`（打入 Next standalone、便携 Node、`publish/cli` 整目录 qkrpc）→ `tauri build` → `scripts/verify-tauri-bundle.mjs`。

**GitHub Release**：push tag 后 `.github/workflows/release-cli.yml` 会自动调用 `Publish-QuickerAgent.ps1`（复用同 job 已构建的 `publish/cli`），上传 `quicker-agent-{version}-x64-setup.exe` 与 `quicker-agent-win-x64-setup.exe`。本地仅调试时可仍跑 `pnpm quicker-agent:publish`。

**下载落地页**：仓库 [`quicker-agent-web/`](../quicker-agent-web/) 提供单页说明与一键下载（指向 `releases/latest/download/quicker-agent-win-x64-setup.exe`）；由 [`.github/workflows/quicker-agent-web-vercel.yml`](../.github/workflows/quicker-agent-web-vercel.yml) 部署到 Vercel。

安装包内应含三块运行时（`$RESOURCE/resources/` 下保留目录结构）：

| 目录 | 内容 |
|------|------|
| `app/` | Next standalone（`server.js` + API 路由） |
| `node/` | 便携 Node（运行 `server.js`） |
| `qkrpc/` | 自包含 `qkrpc.exe` 及依赖 DLL |

校验：`pnpm tauri:verify-bundle`（prepare 后检查 staged；build 后另检查 `target/release/resources`）。

### 发布时注入 LLM Key（混淆进安装包）

真实 API Key **不要**写入 `llm-config.json` 或仓库。推荐：

| 文件 | 用途 |
|------|------|
| `llm-publish.config.json` | 发布用 endpoint（复制 `llm-publish.config.example.json`） |
| `llm-dev.config.json` | **仅本地开发**：个人 endpoint（复制 `llm-dev.config.example.json`） |

`pnpm dev` 时会将 **dev + publish** 合并进内置 fallback（dev 优先），便于调试自定义节点；Tauri 发布仍只打包 publish 配置。

```json
{
  "version": 1,
  "endpoints": [
    { "apiKey": "sk-...", "baseURL": "https://api.bingleimuzi.eu.cc/v1", "model": "gpt-5.5" },
    { "apiKey": "sk-...", "baseURL": "https://ai98pro.xyz/v1", "model": "gpt-5.5" }
  ]
}
```

开发环境 DeepSeek 官方示例（`llm-dev.config.json`）：

```json
{
  "version": 1,
  "endpoints": [
    {
      "apiKey": "sk-...",
      "baseURL": "https://api.deepseek.com/v1",
      "model": "deepseek-v4-flash"
    }
  ]
}
```

本地发布：

```powershell
$env:BUNDLED_LLM_CONFIG_PATH = 'agent-gui/llm-publish.config.json'
pnpm quicker-agent:publish
```

CI（`.github/workflows/release-cli.yml`）将整个 JSON 存为 GitHub Secret **`BUNDLED_LLM_CONFIG`**（单行 JSON 即可，无需多个 `BUNDLED_LLM_*_API_KEY` 环境变量）。仍兼容旧版单 Key secret。

改 `llm-publish.config.json` 后 **发布 publish config**（一条命令：GitHub Secret + Bitiful 加密 OSS）：

```powershell
pwsh -NoProfile -File ./publish/Sync-LlmPublishConfig.ps1
```

前置：`gh auth login`；`publish/.env`（`BITIFUL_*` + **固定不变**的 `LLM_REMOTE_PUBLISH_CIPHER_PEPPER`，见 `publish/.env.example`）。pepper 一次性同步 GitHub：`Sync-LlmRemoteCipherPepper.ps1`；**日常发布勿改 pepper**。

Agent：`.cursor/skills/quicker-agent-llm-apikey-config/SKILL.md`；Cursor **`/publish-llm-config`**。

构建时 `tauri-prepare` 会生成：

| 文件 | 说明 |
|------|------|
| `resources/app/llm-config.json` | 无明文 Key 的默认配置 |
| `resources/app/llm-bundled-secrets.json` | XOR 混淆后的 Key（绑定 app 版本号） |

运行时由服务端解码，Settings 中显示为 `bundled` 来源，不暴露明文。

**产物**（默认路径）：

| 路径 | 说明 |
|------|------|
| `agent-gui/src-tauri/target/release/bundle/nsis/quicker-agent-{version}-x64-setup.exe` | Windows 安装包（权威产物） |
| `publish/quicker-agent-{version}-x64-setup.exe` | 同上，由 `pnpm quicker-agent:publish` 复制 |
| `publish/quicker-agent-win-x64-setup.exe` | latest 别名（与上者同文件，须刚跑过 publish） |
| `agent-gui/src-tauri/target/release/quicker-agent.exe` | 可执行文件 |

安装后无需单独安装 Node / qkrpc；仍需 Quicker 插件。安装包内已含 `llm-config.json` 与混淆后的 `llm-bundled-secrets.json`（发布构建时通过 `BUNDLED_LLM_CONFIG` 或 legacy `BUNDLED_LLM_*_API_KEY` 注入，勿提交仓库）。DeepSeek 等需自备 Key 的模型可在设置中填写。

应用图标源文件：`app-icon.svg`（来自 Quicker.Designer：`Quicker.DesignerHost.WPF.Demo/app-icon.svg`）。修改后重新生成 Tauri / 安装包图标：

```powershell
cd agent-gui
pnpm tauri icon app-icon.svg
```

浏览器开发模式使用 `app/icon.svg`（需与 `app-icon.svg` 同步）。

## 环境变量

见 `.env.example`。Web 端口与 qkrpc 端口由运行时自动选取（`start.mjs` / Tauri 宿主）。

## 架构

```
src-tauri/          → Tauri 2 宿主（启动 qkrpc + Node server，WebView 加载 UI）
app/ + lib/         → Next.js App Router + API
start.mjs           → CLI / dev 启动（非 Tauri 发布路径）
```

## 动作：运行与调试

Agent 工具 **`qkrpc_action`**（见 `lib/qkrpc-action-tool.server.ts`、`lib/instructions.ts`）：

| `action` | 用户可见 | 底层 | 何时用 |
|----------|----------|------|--------|
| `run` | 运行 | `qkrpc action run` | 直接执行，只要结果 |
| `debug` | 调试 | `qkrpc action run --trace` + 侧栏 SSE | 需要逐步输出、排查逻辑 |

- 聊天工具行、工作区侧栏、动作卡片「调试」均走 **debug** 路径（原 trace 已统一命名）。
- 旧参数 `{ action: "trace" }` / `{ action: "run", trace: true }` 仍兼容，服务端归一化为 `debug`。
- CLI 的 `--debug`（Quicker 步骤调试器）与 Agent 的 `debug` **不是同一回事**；后者对应 CLI **`--trace`**。详见 [docs/cli-commands.md](../docs/cli-commands.md#qkrpc-action-run)。

实现模块（内部文件名仍含 `action-trace-*`）：`lib/action-trace-stream.server.ts`（Agent 工具执行）、`lib/action-trace-overlay.ts`（侧栏 UI）、`/api/actions/trace/feed`（浏览器 SSE）。
