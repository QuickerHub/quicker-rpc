# QuickerAgent (agent-gui)

基于 [Vercel AI SDK](https://ai-sdk.dev) 的聊天界面，通过本机 **`qkrpc`** 与 Quicker（QuickerRpc 插件）交互。

## 前置条件

1. Quicker 已运行，并已加载 QuickerRpc 插件（仓库根目录 `pwsh ./build.ps1 -t` 会自动重载插件并启动 `qkrpc serve`）  
2. LLM：复制 `llm-config.example.json` → `llm-config.json`，填写各 provider 的 `apiKey` / `model`（可选 `defaultProvider`；某 provider 加 `"hidden": true` 可从模型菜单隐藏）。**Tauri 发布版**默认通过 `BUNDLED_LLM_BINGLEIMUZI_API_KEY` 在构建时注入混淆 Key，安装包内不含明文 Key。  
3. **开发**：Node.js 20+、pnpm、Rust（仅 Tauri 需要）  

## 开发（推荐流程）

```powershell
# 1. 仓库根目录：构建插件 + CLI，并启动 http://127.0.0.1:9477 上的 qkrpc serve
cd quicker-rpc
pwsh ./build.ps1 -t

# 2. agent-gui（会自动复用 :9477 上的 serve，或自行 staged 启动）
cd agent-gui
pnpm install
copy llm-config.example.json llm-config.json
# 编辑 llm-config.json；一般无需配置 QKRPC_* 

**默认工作目录**：侧栏留空时，开发环境为 **quicker-rpc 仓库根**；Tauri 安装版为 **`Documents/QuickerAgent`**（首次启动自动创建）。可用 `AGENT_GUI_DEFAULT_CWD` 覆盖。

pnpm dev
```

`pnpm dev` = `start.mjs --dev`：优先连接本机 `qkrpc serve`（`GET /health`），否则回退为子进程 `qkrpc` CLI。界面齿轮菜单可「重新检测」Quicker 连接。默认**不会**用系统浏览器打开 localhost（`pnpm dev:browser` 或 `AGENT_GUI_OPEN_BROWSER=1` 可开启）。

```powershell
pnpm tauri:dev   # 桌面壳，内置 qkrpc serve + Next（不打开外部浏览器）
```

## 发布（Tauri 2）

```powershell
# 仓库根目录
pnpm quicker-agent:publish
```

流程：`pnpm build` → `scripts/tauri-prepare.mjs`（打入 Next standalone、便携 Node、`publish/cli` 整目录 qkrpc）→ `tauri build` → `scripts/verify-tauri-bundle.mjs`。

**GitHub Release**：push tag 后 `.github/workflows/release-cli.yml` 会自动调用 `Publish-QuickerAgent.ps1`（复用同 job 已构建的 `publish/cli`），上传 `QuickerAgent_{version}_x64-setup.exe` 与 `quicker-agent-win-x64-setup.exe`。本地仅调试时可仍跑 `pnpm quicker-agent:publish`。

安装包内应含三块运行时（`$RESOURCE/resources/` 下保留目录结构）：

| 目录 | 内容 |
|------|------|
| `app/` | Next standalone（`server.js` + API 路由） |
| `node/` | 便携 Node（运行 `server.js`） |
| `qkrpc/` | 自包含 `qkrpc.exe` 及依赖 DLL |

校验：`pnpm tauri:verify-bundle`（prepare 后检查 staged；build 后另检查 `target/release/resources`）。

### 发布时注入 LLM Key（混淆进安装包）

真实 API Key **不要**写入 `llm-config.json` 或仓库。发布 QuickerAgent 前设置环境变量：

```powershell
$env:BUNDLED_LLM_BINGLEIMUZI_API_KEY = 'sk-...'
# 可选：$env:BUNDLED_LLM_PROVIDERS = 'bingleimuzi'
pnpm quicker-agent:publish
```

CI（`.github/workflows/release-cli.yml`）使用 GitHub Secret `BUNDLED_LLM_BINGLEIMUZI_API_KEY`（仍兼容旧名 `BUNDLED_LLM_AI98PRO_API_KEY`）。构建时 `tauri-prepare` 会生成：

| 文件 | 说明 |
|------|------|
| `resources/app/llm-config.json` | 无明文 Key 的默认配置 |
| `resources/app/llm-bundled-secrets.json` | XOR 混淆后的 Key（绑定 app 版本号） |

运行时由服务端解码，Settings 中显示为 `bundled` 来源，不暴露明文。

**产物**（默认路径）：

| 路径 | 说明 |
|------|------|
| `agent-gui/src-tauri/target/release/bundle/nsis/QuickerAgent_{version}_x64-setup.exe` | Windows 安装包（权威产物） |
| `publish/QuickerAgent_{version}_x64-setup.exe` | 同上，由 `pnpm quicker-agent:publish` 复制 |
| `publish/quicker-agent-win-x64-setup.exe` | latest 别名（与上者同文件，须刚跑过 publish） |
| `agent-gui/src-tauri/target/release/quicker-agent.exe` | 可执行文件 |

安装后无需单独安装 Node / qkrpc；仍需 Quicker 插件。安装包内已含 `llm-config.json` 与混淆后的 `llm-bundled-secrets.json`（发布构建时通过 `BUNDLED_LLM_BINGLEIMUZI_API_KEY` 注入，勿提交仓库）。DeepSeek 等需自备 Key 的模型可在设置中填写。

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
