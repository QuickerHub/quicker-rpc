# quicker-rpc

> 仓库：[QuickerHub/quicker-rpc](https://github.com/QuickerHub/quicker-rpc)

`quicker-rpc` 为 [Quicker](https://getquicker.net/) 提供一个本地 RPC 插件和命令行客户端 `qkrpc`。它通过 **命名管道 + StreamJsonRpc** 把 Quicker 内部能力暴露给外部脚本、CI、本地工具和 AI Agent，用于无头搜索、读取、创建、编辑和发布 Quicker 动作。

## 主要能力

- 连接本机 Quicker 插件，检测 RPC 服务状态。
- 搜索、创建、读取、运行、删除和更新本地 XAction。
- 通过 patch/replace 无头编辑动作步骤、变量和公共子程序。
- 查询 StepRunner schema，辅助生成正确的 `inputParams`。
- 上传/更新共享动作，配合发布流程维护动作库内容。
- 为 Agent 提供机器可读的 CLI 自描述和内置写作指南。

## 快速开始

### 1. 安装 `qkrpc`

从 [GitHub Releases](https://github.com/QuickerHub/quicker-rpc/releases/latest) 下载 **`qkrpc-win-x64-setup.exe`**，双击安装即可。

- 安装目录：`%LOCALAPPDATA%\Programs\qkrpc`
- 安装程序会把该目录加入用户 `PATH`（需**新开**终端后生效）
- 在 Cursor / VS Code 打开本仓库时，`.vscode/settings.json` 会为**工作区集成终端**追加 `publish/cli` 与用户安装目录（`terminal.integrated.env`）；Agent 调 qkrpc 前须确保该环境已生效，或改用 qkrpc MCP 工具
- 卸载：Windows「设置 → 应用」中卸载 **qkrpc**，或运行安装目录下的 `unins000.exe`

可选静默安装（PowerShell）：

```powershell
Invoke-WebRequest -Uri 'https://github.com/QuickerHub/quicker-rpc/releases/latest/download/qkrpc-win-x64-setup.exe' -OutFile "$env:TEMP\qkrpc-setup.exe" -UseBasicParsing
Start-Process -FilePath "$env:TEMP\qkrpc-setup.exe" -ArgumentList '/VERYSILENT' -Wait
```

便携 zip（无需安装程序）：`qkrpc-win-x64.zip`。高级用户仍可使用仓库内的 `publish/install.ps1`（需自行下载 zip）。

### 2. 加载 Quicker 插件

将 `publish/plugin` 下的插件文件复制到动作的 `{packagePath}`，在 Quicker 子程序注册区执行：

```text
load {packagePath}/QuickerRpc.Plugin.{version}.dll
type QuickerRpc.Plugin.Launcher, QuickerRpc.Plugin.{version}
```

`Register` 会启动 RPC 服务并监听命名管道。子程序 **QuickerRpc_Run** 应使用 `Launcher.StartFromQuickerInParam(quicker_in_param, _context)`：

| 条件 | 行为 |
|------|------|
| `_context` 为外部触发（`ActionTrigger.Extern`，含 qkrpc bootstrap） | **强制**仅启动 RPC；**每次**弹出插件版本提示（不打开 QuickerAgent） |
| `_context` 为自动运行（`ActionTrigger.AutoRun`） | 仅启动 RPC（静默，不打开 QuickerAgent） |
| Quicker 内点击 / `agent` / 无参 | 启动 RPC 并打开 QuickerAgent；若 Agent 已在运行则置前主窗口（不再弹插件版本提示） |
| 右键菜单 `quicker_in_param=agent-kill` | **仅**强制退出 QuickerAgent（`taskkill` 进程树），不启动 RPC |
| `quicker:runaction:…?plugin` | 仅 RPC（手动触发时由 `quicker_in_param` 决定；外部触发仍强制 Extern 行为） |

```csharp
Launcher.StartFromQuickerInParam(quicker_in_param, _context);
Launcher.Start(_context);
```

### 3. 验证环境

Quicker 已启动且插件已加载后：

```powershell
qkrpc help --json
# 可选（agent-gui / 高频）：qkrpc serve → GET http://127.0.0.1:9477/health
```

Agent 约定见 [AGENTS.md](AGENTS.md)（根目录；`agent-gui/` 另有嵌套 [agent-gui/AGENTS.md](agent-gui/AGENTS.md)）。CLI 约定：退出码 `0` 表示成功，`1` 表示失败；脚本和 Agent 场景推荐始终使用 `--json`。

### 4. 在其他 Agent 中安装 MCP（Cursor / VS Code / Claude / Windsurf / Cline）

无需 QuickerAgent，任意支持 MCP 的 Agent 可一键接入：

```powershell
qkrpc mcp install --all --project
```

- 写入各宿主 MCP 配置（stdio：`qkrpc mcp`）
- 设置 `QKRPC_WORKSPACE_ROOT`、初始化 `.quicker/` 工作区
- 可选复制 **quicker-authoring** skill（Cursor）

完整说明：[docs/agent-mcp-integration.md](docs/agent-mcp-integration.md)

## 常用命令

完整命令表见 [docs/cli-commands.md](docs/cli-commands.md)，机器可读版本使用 `qkrpc help --json`。

```powershell
# 读取 Agent 写动作指南
qkrpc guide get --topic overview --json
qkrpc guide get --topic authoring-workflow --json
qkrpc guide get --topic action-icons --json
qkrpc guide get --topic subprogram-workflow --json

# 搜索和读取动作
qkrpc action list --query "keyword" --json
qkrpc action get --id <guid> --return-mode full --json

# 创建和编辑动作
qkrpc action create --title "My Action" --json
qkrpc action patch --id <guid> --patch-file patch.json --expected-edit-version <N> --json
qkrpc action replace --id <guid> --xaction-file action.json --json

# 查询步骤类型、图标和公共子程序
qkrpc step-runner search --query "clipboard|text" --json
qkrpc step-runner get --key <stepRunnerKey> --json
qkrpc fa search --query "address book" --json
qkrpc subprogram search --query "keyword" --json

# 运行、打开设计器、更新共享动作
qkrpc action run --id <idOrName> --wait --json
qkrpc action edit --id <guid> --json
qkrpc action update --id <sharedActionGuid> --changelog "说明" --json
```

写动作时请先读取内置指南，尤其是 `authoring-workflow`、`subprogram-workflow` 和 `implementation-fallback`。大 JSON 可通过 `--patch-file -` 或 `--xaction-file -` 从 stdin 传入。

## 架构

```text
qkrpc.exe (CLI client)  --named pipe-->  QuickerRpc.Plugin (RPC server)
                                                |
                                                v
                                      Quicker UI thread / services
```

- 管道名：`QuickerRpc_Server_QRPC2026`（见 `QuickerRpcPipeNames.ServerPipe`）。
- 插件托管 `IQuickerRpcService`，CLI 作为客户端连接并发起 RPC 调用。
- 涉及 Quicker 内部对象访问的操作由插件切回 Quicker UI 线程执行。

## 项目结构

| 项目 | 说明 |
|------|------|
| `QuickerRpc.Contracts` | RPC 合约、管道名、客户端封装 |
| `QuickerRpc.Plugin` | Quicker 插件与 RPC 服务端 |
| `QuickerRpc.Console` | `qkrpc.exe` 命令行客户端 |
| `QuickerRpc.AgentModel` | XAction 压缩模型、patch 模型、StepRunner 元数据和内置指南 |
| `QuickerRpc.Test` | 连接真实 Quicker 插件的集成测试 |
| `QuickerRpc.Plugin.Test` | 面向 Quicker 程序集的离线反射/扫描测试 |

## Agent GUI（实验）

`agent-gui/`：基于 Vercel AI SDK 的 Web 聊天界面，通过本机 `qkrpc` 驱动 Quicker。见 [agent-gui/README.md](agent-gui/README.md)。可选插件（如语音输入）的安装目录与下载源见 [docs/agent-gui-plugin-storage.md](docs/agent-gui-plugin-storage.md)。

**下载页**（Vercel 静态站，跳转官方 Release 安装包）：[quicker-agent-web/](quicker-agent-web/) — 由 [`.github/workflows/quicker-agent-web-vercel.yml`](.github/workflows/quicker-agent-web-vercel.yml) 发布，或本地 `node quicker-agent-web/scripts/build.mjs` 后预览 `dist/`。

编译发布（Tauri 2 Windows 安装包）：

```powershell
pnpm quicker-agent:publish
```

产物：`agent-gui/src-tauri/target/release/bundle/nsis/` 下的 NSIS 安装程序（内置 `qkrpc` 与 Node）。见 [agent-gui/README.md](agent-gui/README.md)。

## 开发

需要 [.NET 10 SDK](https://dotnet.microsoft.com/download)（`global.json` 固定最低版本）。`qkrpc` CLI 目标为 **net10.0**；**QuickerRpc.Plugin** 仍为 **net472**（与 Quicker.exe 宿主一致）。

```powershell
dotnet build QuickerRpc.slnx

# 构建插件测试包、发布本机 CLI，并触发 Quicker 重载插件动作
pwsh ./build.ps1 -t
```

插件通过仓库根目录的 `qkref.props` 引用 Quicker 程序集，默认路径为 `C:\Program Files\Quicker`。需要指向自定义 Quicker 构建时：

```powershell
dotnet build QuickerRpc.Plugin -p:QuickerDllPath="D:\path\to\Quicker\bin\x64\Debug\net472"
```

常用测试：

```powershell
# 需要 Quicker 已运行并加载 QuickerRpc 插件
dotnet test QuickerRpc.Test -c Release

# 仅验证命名管道连通性
dotnet test QuickerRpc.Test --filter FullyQualifiedName~QuickerRpcPipeIntegrationTests
```

## 发布

维护者发布 CLI 和插件前，先更新 `version.json`、补充 `publish/changelogs/vX.Y.Z.md` 并提交代码。随后执行：

```powershell
pwsh ./publish/Publish-GitHubRelease.ps1
```

也可以推送 `v*` tag，由 `.github/workflows/release-cli.yml` 自动构建并上传 GitHub Release 资产。

| 产物 | 路径 |
|------|------|
| CLI zip | `publish/qkrpc-{version}-win-x64.zip` |
| 本机 CLI | `%LOCALAPPDATA%\Programs\qkrpc\qkrpc.exe` |
| 插件 DLL | `publish/plugin/QuickerRpc.Plugin.*.dll` |

## 参考资料

- [CLI 命令参考](docs/cli-commands.md)
- [Quicker 动作数据存储架构](docs/quicker-action-data-storage.md)
- [GitHub Releases](https://github.com/QuickerHub/quicker-rpc/releases)
