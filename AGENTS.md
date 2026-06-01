# quicker-rpc — 给 AI Agent 的快速说明

Quicker 插件 + `qkrpc.exe` CLI，通过 **命名管道 + StreamJsonRpc** 让外部命令行调用 Quicker 内能力。

**CLI 自描述（优先）**：`qkrpc help --json` — 命令、参数、无头编辑工作流。人类可读：[docs/cli-commands.md](docs/cli-commands.md)。

详细用法见 [README.md](README.md)。

## 发布

```powershell
# CLI → GitHub Releases（用户 irm | iex 安装）
.\publish\Publish-GitHubRelease.ps1
```

版本：`version.json`（`QuickerRpc` 四段；Release tag 为前三段 `vX.Y.Z`）。

**用户安装：**

```powershell
$p="$env:TEMP\qkrpc-install.ps1"; iwr https://github.com/QuickerHub/quicker-rpc/releases/latest/download/install.ps1 -OutFile $p -UseBasicParsing; & $p
```

**Cursor**：改代码后测试构建见 `.cursor/skills/quicker-rpc-build-test/SKILL.md`（`build.ps1 -t`）；公开发布见 `.cursor/skills/quicker-rpc-publish/SKILL.md`；命令 `/publish`。

| 产物 | 路径 |
|------|------|
| CLI | `%LOCALAPPDATA%\Programs\qkrpc\qkrpc.exe` |
| CLI zip | `publish/qkrpc-{version}-win-x64.zip` |
| 插件 | `publish/plugin/QuickerRpc.Plugin.*.dll` |

## 管道

- 名：`QuickerRpc_Server_QRPC2026`（`QuickerRpcPipeNames.ServerPipe`）
- 插件 **host server**，CLI **client connect**

## Quicker 加载插件

```text
load {packagePath}/QuickerRpc.Plugin.{version}.dll
type QuickerRpc.Plugin.AssemblyLoader, QuickerRpc.Plugin.{version}
```

## CLI（Agent 无头编辑）

写动作流程（完整约束）：`qkrpc guide get --topic authoring-workflow --json`  
公共子程序：`qkrpc guide get --topic subprogram-workflow --json`

```powershell
qkrpc help --json
qkrpc guide get --topic authoring-workflow --json
qkrpc guide get --topic subprogram-workflow --json
qkrpc action list --query "<keyword>" --json
qkrpc action get --id <guid> --return-mode full --json
qkrpc subprogram search --query "<keyword>" --json
qkrpc subprogram get --id <idOrName> --return-mode full --json
qkrpc step-runner search --query "关键词|english|sys:*" --json
qkrpc step-runner get --key <stepRunnerKey> --json
qkrpc action patch --id <guid> --patch-file patch.json --expected-edit-version <N> --json
```

**调用公共子程序**：`subprogram search/get` 取 **`callIdentifier`**（通常 `%%{guid}`）→ `step-runner get --key sys:subprogram` → `action patch` 写 `inputParams.subProgram`。

**禁止**：未 `step-runner get` 就猜 `inputParams` 键名；未 `subprogram get/search` 就猜 `callIdentifier`；patch 写与目录 **Default** 相同的**普通**参数（控制字段除外）；patch 成功后仅为验证再 `action get`。

退出码：0 成功，1 失败。大 JSON 用 `--patch-file -` 从 stdin 读。

## 测试

| 项目 | 用途 |
|------|------|
| `QuickerRpc.Plugin.Test` | 离线扫描 `Quicker.exe` 反射（Debug/Release） |
| `QuickerRpc.Test` | **活进程** RPC：`QuickerRpcClient` → 命名管道 → `IQuickerRpcService`（需 Quicker + 插件） |

```powershell
# 需 Quicker 已启动并加载插件
dotnet test QuickerRpc.Test --filter FullyQualifiedName~QuickerRpcPipeIntegrationTests

# 指定本地 XAction 测 get
$env:QUICKER_RPC_TEST_ACTION_ID = "<guid>"
dotnet test QuickerRpc.Test --filter Rpc_GetCompressedAction
```

## Quicker 源码参考（反射 / 实现原理）

本地浅克隆 [QuickerOrg/Quicker](https://github.com/QuickerOrg/Quicker) **dev** 分支，仅供 Agent **搜索实现**；**不**提交 Git（`.gitignore` → `.ref/Quicker/`）。

| 要找的内容 | 路径 |
|------------|------|
| 源码根 | `.ref/Quicker/` |
| 主程序（`Quicker.exe` 工程） | `.ref/Quicker/QuickerPc/Quicker/` |
| 领域服务（`ActionEditMgr` 等） | `…/Quicker/Domain/Services/` |
| XAction 步骤/变量/子程序 | `…/Quicker/Actions/XActions/` |
| 设计器 UI | `…/Quicker/View/X/` |
| 公共 API | `.ref/Quicker/QuickerPc/Quicker.Public/` |
| 共享 DTO、通用模型 | `.ref/Quicker/QuickerPc/Common/Quicker.Common/`（子模块） |

```powershell
# 首次
git clone --branch dev --single-branch --depth 1 https://github.com/QuickerOrg/Quicker .ref/Quicker
git -C .ref/Quicker submodule update --init QuickerPc/Common

# 更新
git -C .ref/Quicker pull origin dev
git -C .ref/Quicker submodule update --init QuickerPc/Common
```

**本仓库反射代码**在 `QuickerRpc.Plugin/Reflection/`、`QuickerRpc.Plugin/Services/`；离线扫 exe 用 `QuickerRpc.Plugin.Test/`。完整查找流程见 **`.cursor/skills/quicker-exe-type-probing/SKILL.md`**。

## 模块

| 项目 | 职责 |
|------|------|
| `QuickerRpc.AgentModel` | XAction 压缩/patch、StepRunner 模型、嵌入式 ActionAuthoring 文档 |
| `QuickerRpc.Contracts` | `IQuickerRpcService`、管道名、`QuickerRpcClient` |
| `QuickerRpc.Plugin` | RPC 服务端 + `HeadlessActionProgramService` |
| `QuickerRpc.Console` | `qkrpc.exe` |
