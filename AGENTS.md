# quicker-rpc — 给 AI Agent 的快速说明

> **系统提示（可复制到规则）**  
> **开发热更新（必守）**：在本仓库改完 **`QuickerRpc.Plugin` / `Console` / `Contracts` / `AgentModel`**、`docs/action-authoring-src/**` 或构建脚本后，**由 Agent 在终端自动执行**（勿只改代码不构建、勿让用户代跑）：`pwsh -NoProfile -File ./build.ps1 -t`（或 Cursor **`/hot-update`**）。作用：停旧 `qkrpc serve` → 编译发布 CLI → **重载 Quicker 插件 DLL** → 启新 serve（`http://127.0.0.1:9477`）。**`start-agent-gui.ps1` / agent-gui 可保持运行**。仅改 `agent-gui/**` 时**不要**跑 `-t`（Next HMR）；改完后 **`dev_frontend_check` 直到 `ok: true`，有报错继续修**（见下文「agent-gui 前端收尾检查」）。细则：`.cursor/skills/quicker-rpc-build-test/SKILL.md`、`.cursor/skills/quicker-agent-gui-frontend/SKILL.md`。  
> `qkrpc` 是本机已安装的 **CLI 可执行命令**（Windows：`qkrpc` / `%LOCALAPPDATA%\Programs\qkrpc\qkrpc.exe`）。在终端 **直接调用** `qkrpc <子命令>`，不要把它当成只能由用户手动的说明文档。前置：Quicker 已运行且已加载 QuickerRpc 插件；**勿**先 `ping` 探活。探命令：`qkrpc help --json`；写动作：`qkrpc guide get --topic authoring-workflow --json`。高频/agent-gui：`qkrpc serve`（`GET /health`）。机器可读输出加 `--json`；退出码 0=成功、1=失败。

Quicker 插件 + `qkrpc.exe` CLI，通过 **命名管道 + StreamJsonRpc** 让外部命令行调用 Quicker 内能力。

**CLI 自描述（优先）**：`qkrpc help --json` — 命令、参数、无头编辑工作流。人类可读：[docs/cli-commands.md](docs/cli-commands.md)。

**agent-gui / 高频调用**：优先 `qkrpc serve`（`http://127.0.0.1:9477`，持久管道）；未启动 serve 时 agent-gui 自动回退为 CLI 子进程。

## 开发热更新（Agent 自动 `build.ps1 -t`）

改源码后 **不会** 自动生效到正在跑的 Quicker / `qkrpc serve`。完成下列路径的代码修改后，**默认由 Agent 自行在仓库根目录执行热更新**（用户未明确说「不要 build」时）：

```powershell
pwsh -NoProfile -File ./build.ps1 -t
```

| 改了什么 | 是否跑 `-t` | 说明 |
|----------|-------------|------|
| `QuickerRpc.Plugin/**` | **是** | 重载插件 DLL 到 Quicker 测试包 |
| `QuickerRpc.Console/**`、`Contracts/**` | **是** | 发布 CLI + 重启 serve |
| `QuickerRpc.AgentModel/**` | **是** | CLI 与插件均可能依赖 |
| `docs/action-authoring-src/**` | **是** | 嵌入 CLI / agent 指南 |
| `build.ps1`、`build.yaml`、`publish/publish-rpc.ps1` | **是** | 构建链路 |
| 仅 `agent-gui/**` | **否** | Next HMR；**收尾必做**「前端检查」（见下节） |
| `agent-gui/llm-publish.config.json` | **否** | 改完后 **Agent 自动** `publish/Sync-LlmPublishConfig.ps1` → GitHub Secret `BUNDLED_LLM_CONFIG`；**勿 commit**；细则：`.cursor/skills/quicker-agent-gui-llm-publish-config/SKILL.md` |
| 仅 `README.md`、`AGENTS.md`、`.cursor/**`（未动 C#） | **否** | 文档/规则 |

**不必关 agent-gui**：`-t` 会停旧 serve、装新 `qkrpc.exe`、再启 serve（端口仍为 `9477`）。Quicker 需已启动（插件重载走 `quicker:runaction:…`）。

**验证**（构建退出码 0 后）：`Invoke-RestMethod http://127.0.0.1:9477/health` 或 `qkrpc action list --limit 1 --json`。

Cursor：**`/hot-update`** = 同上命令的快捷入口。详情：`.cursor/commands/hot-update.md`、`.cursor/skills/quicker-rpc-build-test/SKILL.md`。

## agent-gui 前端收尾检查（改 UI 后必做）

完成 **`agent-gui/**`** 下会影响页面的修改后，**在宣布完成前**由 Agent 在本机循环检查；**有报错就继续修**，直到通过。

前提：`start-agent-gui.ps1` / `pnpm dev` 已在跑（`http://127.0.0.1:3000`），`NODE_ENV=development`。

1. 等待 Next 重新编译（数秒；可看 dev 终端）。
2. **`dev_frontend_check`**（聊天工具）或 `GET http://127.0.0.1:3000/api/dev/frontend-check`，直到 **`ok: true`**。
3. **`ok: false`**：读返回 **`issues`**（`kind` / `message` / `file` / `line`）及 `agent-gui/.local/frontend-build-error.json`、`frontend-client-errors.json` → 改源码 → 回到步骤 1。**不要**未检查就声称「前端已修好」。
4. **`ok: true` 后**：再调 **`dev_frontend_check({ clearCaptured: true })`** 清空陈旧 HMR/浏览器误报；若仍失败则继续修。
5. 改过 **`/tool-test`** 等额外路由时：`dev_frontend_check({ paths: ["/", "/tool-test"] })`。

```powershell
# Agent 可直接探测（dev 在跑时）
Invoke-RestMethod http://127.0.0.1:3000/api/dev/frontend-check
```

| 捕获来源 | 落盘 |
|----------|------|
| 浏览器 `window.error` / `unhandledrejection` | `.local/frontend-client-errors.json` |
| Next 编译失败（dev 终端） | `.local/frontend-build-error.json` |
| HTTP 探测 `/`、`/api/llm`、`/api/ping` | 工具返回 `issues[]` |

**禁止**：仅 `agent-gui/**` 改动却跑 `build.ps1 -t`；把 `.local/*.json` 提交进 Git。

细则：`.cursor/skills/quicker-agent-gui-frontend/SKILL.md`；聊天系统提示：`agent-gui/lib/instructions.ts`。

详细用法见 [README.md](README.md)。

## 发布

```powershell
# CLI → GitHub Releases（用户 irm | iex 安装）
.\publish\Publish-GitHubRelease.ps1
```

版本：`version.json`（`QuickerRpc` 四段；Release tag 为前三段 `vX.Y.Z`）。

**用户安装：** [Releases](https://github.com/QuickerHub/quicker-rpc/releases/latest) → 下载并运行 **`qkrpc-win-x64-setup.exe`**（单文件安装包，无需脚本）。

**Cursor**：改 **Plugin / Console / Contracts / AgentModel** 后 **Agent 自动** `build.ps1 -t`（见上文「开发热更新」）；也可用 **`/hot-update`**。skill：`quicker-rpc-build-test`。改 **agent-gui UI** → `quicker-agent-gui-frontend`（`dev_frontend_check`，**不**跑 `-t`）。改 **`llm-publish.config.json`** → `quicker-agent-gui-llm-publish-config`（`Sync-LlmPublishConfig.ps1` 或 **`/sync-llm-publish-config`**）。公开发布 **`/publish`** → `quicker-rpc-publish`。**动作页说明** → `quicker-action-doc`。

| 产物 | 路径 |
|------|------|
| CLI | `%LOCALAPPDATA%\Programs\qkrpc\qkrpc.exe` |
| CLI 安装包 | `publish/qkrpc-{version}-win-x64-setup.exe`（Release 上传 `qkrpc-win-x64-setup.exe`） |
| CLI zip（便携） | `publish/qkrpc-{version}-win-x64.zip` |
| 插件 | `publish/plugin/QuickerRpc.Plugin.*.dll` |

## 管道

- 名：`QuickerRpc_Server_QRPC2026`（`QuickerRpcPipeNames.ServerPipe`）
- 插件 **host server**，CLI **client connect**

## 插件监控窗（Quicker 内）

**启动模式**：公共子程序 **QuickerAgent.Start**（`%%7d6999ed-93a1-4db0-9763-5405066199ac`）→ **QuickerRpc_Run** → `Launcher.StartFromQuickerInParam(quicker_in_param, _context)`。`ActionTrigger.Extern` **强制**仅 RPC 且**每次**弹插件版本提示；`ActionTrigger.AutoRun` 仅 RPC（静默）；Quicker 内点击等则打开 QuickerAgent（已运行时置前窗口，不重复版本提示）。分享动作 `aa5917ad-…` 调用 **QuickerAgent.Start**；qkrpc bootstrap 仍 `?plugin`（Extern 触发）。

## Quicker 加载插件

```text
load {packagePath}/QuickerRpc.Plugin.{version}.dll
type QuickerRpc.Plugin.Launcher, QuickerRpc.Plugin.{version}
```

## CLI（Agent 无头编辑）

编辑链路：`qkrpc guide get --topic overview --json` → `authoring-workflow`（P1–P7）  
公共子程序：`qkrpc guide get --topic subprogram-workflow --json`

```powershell
qkrpc help --json
qkrpc guide get --topic overview --json
qkrpc guide get --topic authoring-workflow --json
qkrpc guide get --topic subprogram-workflow --json
qkrpc action list --query "<keyword>" --json
qkrpc action get --id <guid> --return-mode full --json
qkrpc subprogram search --query "<keyword>" --json
qkrpc subprogram get --id <idOrName> --return-mode full --json
qkrpc step-runner search --query "关键词|english|sys:*" --json
qkrpc step-runner get --key <stepRunnerKey> [--control-field <value>] --json
qkrpc guide get --topic step-runner-get --json
qkrpc guide get --topic action-icons --json
qkrpc fa search --query "<keyword>" --json
qkrpc action set-metadata --id <guid> --icon "fa:Light_<Name>" --expected-edit-version <N> --json
qkrpc action patch --id <guid> --patch-file patch.json --expected-edit-version <N> --json
```

**调用公共子程序**：`subprogram search/get` 取 **`callIdentifier`** → `step-runner get --key sys:subprogram` → CLI 用 `action patch` 写步骤；agent-gui 用 `workspace_action_edit_data` 改 `data.json` 后 `qkrpc_action_patch({ id })`。

**Step-runner（Agent vs UI）**

| 命令 / 工具 | 谁用 | 用途 |
|-------------|------|------|
| `step-runner search` / `qkrpc_step_runner_search` | Agent | 定 `key`、默认 `controlField`；**无** `agentGuidance` 长文 |
| `step-runner get` / `qkrpc_step_runner_get` | **Agent 唯一** | 压缩 schema、`inputParams` 键名；**无**模块级 `icon` |
| `step-runner get-ui` / `step-runner.getUi` | **仅 action-editor UI** | 含 `icon` 与完整 control；**Agent 禁止** |

**禁止**：未 `step-runner get` 就猜 `inputParams` 键名；Agent 调用 `step-runner get-ui`；未 `subprogram get/search` 就猜 `callIdentifier`；未 `fa search` 就猜图标 spec（见 **`guide get --topic action-icons`**）；patch 写与目录 **Default** 相同的**普通**参数（控制字段除外）；patch 成功后仅为验证再 `action get`。表达式/计算/LINQ **优先 `expressions` / `sys:evalexpression`**；无专用模块见 `guide get --topic implementation-fallback`（**先表达式，再 `sys:csscript`**；`sys:runScript` 仅极简单系统命令或用户脚本）。

退出码：0 成功，1 失败。大 JSON 用 `--patch-file -` 从 stdin 读。

## 测试

| 项目 | 用途 |
|------|------|
| `QuickerRpc.Plugin.Test` | 离线扫描 `Quicker.exe` 反射（Debug/Release） |
| `QuickerRpc.Test` | **活进程** RPC：`QuickerRpcClient` → 命名管道 → `IQuickerRpcService`（需 Quicker + 插件） |

```powershell
# 需 Quicker 已启动并加载插件（改 Plugin 后先 build.ps1 -t 并在 Quicker 里 reload DLL）
dotnet test QuickerRpc.Test -c Release

# 仅连通性
dotnet test QuickerRpc.Test --filter FullyQualifiedName~QuickerRpcPipeIntegrationTests

# 本地夹具动作 _rpc_test（自动 create + 写入 2 步/2 变量，断言 get 后 steps、variables > 0）
dotnet test QuickerRpc.Test --filter Rpc_GetCompressedAction_rpc_test_fixture

# 其它内容断言（改 Plugin 后须先 pwsh ./build.ps1 -t 并在 Quicker 重载 DLL）
dotnet test QuickerRpc.Test --filter FullyQualifiedName~QuickerRpcRpcContentTests
dotnet test QuickerRpc.Test --filter FullyQualifiedName~clipboard_n10

# 可选覆盖
$env:QUICKER_RPC_TEST_ACTION_ID = "<guid>"
$env:QUICKER_RPC_TEST_SHARED_ACTION_ID = "f5c76108-3ce9-433f-8cd0-8f0d9c562052"
$env:QUICKER_RPC_TEST_CLIPBOARD_N10_ACTION_ID = "32c12786-9bb8-4b0c-8d55-7e6a4c8a5d10"  # 剪贴板 n10（UseTemplate）
$env:QUICKER_RPC_TEST_SUBPROGRAM = "某子程序名"
```

## Quicker 源码参考（反射 / 实现原理）

可选：维护者本机 `.ref/Quicker/`（gitignore，不在本仓库；无公开克隆说明）。有则 `rg` 查 Debug 类型名；无则靠本仓库封装与 exe 探测。

| 手段 | 用途 |
|------|------|
| `QuickerRpc.Plugin/Reflection/`、`Services/` | 已有反射封装（优先） |
| `QuickerRpc.Plugin.Test/` | 离线扫 `Quicker.exe`（Debug/Release 签名） |
| `QUICKER_DLL_PATH` / `QUICKER_DEBUG_DLL_PATH` | 指向本机 Release/Debug `Quicker.exe` |

完整流程见 **`.cursor/skills/quicker-exe-type-probing/SKILL.md`**。

## 模块

| 项目 | 职责 |
|------|------|
| `QuickerRpc.AgentModel` | XAction 压缩/patch、StepRunner 模型；文档源 `docs/action-authoring-src/` → 生成 `cli/` 嵌入 + 单 skill `skills/quicker-authoring/`（QuickerAgent） |
| `QuickerRpc.Contracts` | `IQuickerRpcService`、管道名、`QuickerRpcClient` |
| `QuickerRpc.Plugin` | RPC 服务端 + `HeadlessActionProgramService` |
| `QuickerRpc.Console` | `qkrpc.exe` |
| `agent-gui/` | Next.js + AI SDK 聊天 Agent（子进程调用 `qkrpc`）；见 `agent-gui/README.md` |
