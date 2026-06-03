# quicker-rpc — 给 AI Agent 的快速说明

> **系统提示（可复制到规则）**  
> `qkrpc` 是本机已安装的 **CLI 可执行命令**（Windows：`qkrpc` / `%LOCALAPPDATA%\Programs\qkrpc\qkrpc.exe`）。在终端 **直接调用** `qkrpc <子命令>`，不要把它当成只能由用户手动的说明文档。前置：Quicker 已运行且已加载 QuickerRpc 插件；**勿**先 `ping` 探活。探命令：`qkrpc help --json`；写动作：`qkrpc guide get --topic authoring-workflow --json`。高频/agent-gui：`qkrpc serve`（`GET /health`）。机器可读输出加 `--json`；退出码 0=成功、1=失败。

Quicker 插件 + `qkrpc.exe` CLI，通过 **命名管道 + StreamJsonRpc** 让外部命令行调用 Quicker 内能力。

**CLI 自描述（优先）**：`qkrpc help --json` — 命令、参数、无头编辑工作流。人类可读：[docs/cli-commands.md](docs/cli-commands.md)。

**agent-gui / 高频调用**：优先 `qkrpc serve`（`http://127.0.0.1:9477`，持久管道）；未启动 serve 时 agent-gui 自动回退为 CLI 子进程。

详细用法见 [README.md](README.md)。

## 发布

```powershell
# CLI → GitHub Releases（用户 irm | iex 安装）
.\publish\Publish-GitHubRelease.ps1
```

版本：`version.json`（`QuickerRpc` 四段；Release tag 为前三段 `vX.Y.Z`）。

**用户安装：** [Releases](https://github.com/QuickerHub/quicker-rpc/releases/latest) → 下载并运行 **`qkrpc-win-x64-setup.exe`**（单文件安装包，无需脚本）。

**Cursor**：改代码后测试构建见 `.cursor/skills/quicker-rpc-build-test/SKILL.md`（`build.ps1 -t`）；公开发布见 `.cursor/skills/quicker-rpc-publish/SKILL.md`；命令 `/publish`。

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

加载插件后：`Launcher.Start(openMonitor: true)` 或子程序 **QuickerRpc_Run** 入参 **`openMonitor=true`** 启动并打开监控窗；虚拟动作页 **QuickerRpc 管理**（`cbb222eb-9672-4892-ba29-355a70d6b912`）仅打开监控窗；`Launcher.ShowMonitor()` / `ToggleMonitor()`。**QuickerRpc Monitor**：两个标签页分别列出 **qkrpc 虚拟动作页**（`scope=agent`）与 **全库最近编辑 XAction**（按 `LastEditTimeUtc` 排序）。窗口在 qkrpc 无头写入（create/patch/replace/metadata/delete）或 RPC 客户端连/断、窗口重新激活、点「刷新」时自动防抖刷新（约 350ms）。

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
qkrpc guide get --topic action-icons --json
qkrpc fa search --query "<keyword>" --json
qkrpc action set-metadata --id <guid> --icon "fa:Light_<Name>" --expected-edit-version <N> --json
qkrpc action patch --id <guid> --patch-file patch.json --expected-edit-version <N> --json
```

**调用公共子程序**：`subprogram search/get` 取 **`callIdentifier`** → `step-runner get --key sys:subprogram` → CLI 用 `action patch` 写步骤；agent-gui 用 `workspace_action_edit_data` 改 `data.json` 后 `qkrpc_action_patch({ id })`。

**禁止**：未 `step-runner get` 就猜 `inputParams` 键名；未 `subprogram get/search` 就猜 `callIdentifier`；未 `fa search` 就猜图标 spec（见 **`guide get --topic action-icons`**）；patch 写与目录 **Default** 相同的**普通**参数（控制字段除外）；patch 成功后仅为验证再 `action get`。表达式/计算/LINQ **优先 `expressions` / `sys:evalexpression`**；无专用模块见 `guide get --topic implementation-fallback`（**先表达式，再 `sys:csscript`**；`sys:runScript` 仅极简单系统命令或用户脚本）。

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
