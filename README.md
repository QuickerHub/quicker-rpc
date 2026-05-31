# quicker-rpc

> 仓库：[QuickerHub/quicker-rpc](https://github.com/QuickerHub/quicker-rpc)

Quicker 插件 + 命令行客户端：通过 **命名管道 + StreamJsonRpc**，让外部 `qkrpc.exe` 调用 Quicker 内插件能力。

当前已实现：**更新分享动作**（`ActionEditMgr.UpdateSharedActionAsync`）。

## 架构

```text
Quicker (plugin DLL)  --named pipe-->  qkrpc.exe (CLI client)
     ^ hosts IQuickerRpcService              ^ connects & calls RPC
```

- 管道名：`QuickerRpc_Server_QRPC2026`（见 `QuickerRpcPipeNames.ServerPipe`）
- 单向使用场景：CLI 连接插件；插件在 Quicker UI 线程执行操作

## 发布

维护者对外发布 **qkrpc CLI**（GitHub Releases）：

```powershell
# 1. 更新 version.json 并 commit
# 2. 发布（需 gh auth login）
pwsh ./publish/Publish-GitHubRelease.ps1
```

或推送 `v*` tag，由 `.github/workflows/release-cli.yml` 自动构建上传。

| 路径 | 说明 |
|------|------|
| `publish/qkrpc-{version}-win-x64.zip` | CLI 发布包（GitHub Releases 资产） |
| `%LOCALAPPDATA%\Programs\qkrpc\qkrpc.exe` | 本机已安装 CLI |

### 用户安装 CLI（一条命令）

发布到 [GitHub Releases](https://github.com/QuickerHub/quicker-rpc/releases) 后，用户在 PowerShell 执行：

```powershell
$p="$env:TEMP\qkrpc-install.ps1"; iwr https://github.com/QuickerHub/quicker-rpc/releases/latest/download/install.ps1 -OutFile $p -UseBasicParsing; & $p
```

安装到 `%LOCALAPPDATA%\Programs\qkrpc` 并写入用户 PATH。指定版本：

```powershell
$p="$env:TEMP\qkrpc-install.ps1"; iwr https://github.com/QuickerHub/quicker-rpc/releases/download/v0.3.10/install.ps1 -OutFile $p -UseBasicParsing; & $p
```

卸载：

```powershell
$p="$env:TEMP\qkrpc-install.ps1"; iwr https://github.com/QuickerHub/quicker-rpc/releases/latest/download/install.ps1 -OutFile $p -UseBasicParsing; & $p -Uninstall
```

## 在 Quicker 中加载插件

将 `publish/plugin` 下文件复制到动作的 `{packagePath}`，在子程序注册区执行：

```text
load {packagePath}/QuickerRpc.Plugin.{version}.dll
type QuickerRpc.Plugin.AssemblyLoader, QuickerRpc.Plugin.{version}
```

`Register` 会自动启动 RPC 服务（命名管道监听）。

也可在 Quicker 动作中调用：

```csharp
QuickerRpc.Plugin.Launcher.Start()
```

## CLI 用法

退出码：**0 成功，1 失败**。推荐 `--json`。完整命令表：`qkrpc help --json`。

```powershell
qkrpc ping --json

# 无头编辑 XAction（需 Quicker + 插件在线）
qkrpc guide get --topic overview --json
qkrpc action list --query myaction --json
qkrpc action get --id <guid> --return-mode full --json
qkrpc action patch --id <guid> --patch-file patch.json --json

# 运维
qkrpc action update --id <sharedActionGuid> --changelog "说明" --json
qkrpc action run --id <idOrName> --wait --json
```

## 开发

```powershell
dotnet build QuickerRpc.slnx

# 改代码后本地/测试包验证（Quicker 测试包 + 本机 CLI）
pwsh ./build.ps1 -t
```

插件引用 Quicker 程序集 via 仓库根目录 `qkref.props`（默认 `C:\Program Files\Quicker`）。调试时可：

```powershell
dotnet build QuickerRpc.Plugin -p:QuickerDllPath="D:\path\to\Quicker\bin\x64\Debug\net472"
```

## 参考

- Quicker API（更新动作）：`wpf-demos/quicker-modifier` → `ActionEditService.UpdateActionAsync`
- StreamJsonRpc 管道模式：`CeaQuickerTools/IntelliTools` → `IntelliToolsQuickerRpcServer`
