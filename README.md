# quicker-rpc

> 私有仓库：[QuickerHub/quicker-rpc](https://github.com/QuickerHub/quicker-rpc)

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

```powershell
# 推荐：插件 qkbuild 打包 + CLI 发布（PATH）
.\build.ps1

# 仅 CLI（不跑 qkbuild）
.\publish\publish-rpc.ps1
```

`build.ps1` 会依次执行：

1. `qkbuild build -c build.yaml` — 将 `QuickerRpc.Plugin` 打成 Quicker 依赖 zip（配置见 `build.yaml` / `version.json`）
2. `publish/publish-rpc.ps1` — 发布 `qkrpc.exe` 并追加用户 PATH

qkbuild 常用参数（透传给第一步）：

```powershell
.\build.ps1 -p          # 发布构建（小版本 +1，可选 OSS 上传）
.\build.ps1 -p -n       # 发布但不改 version.json
.\build.ps1 -n          # 构建但不改版本号
```

产物：

| 路径 | 说明 |
|------|------|
| `publish/cli/qkrpc.exe` | 自包含 CLI（会追加到用户 PATH） |
| `publish/plugin/QuickerRpc.Plugin.*.dll` | Quicker 插件及依赖 |

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

退出码：**0 成功，1 失败**。推荐 `--json`。

```powershell
# 检查 Quicker 插件是否在线
qkrpc ping --json

# 更新分享动作
qkrpc action update --id <sharedActionGuid> --changelog "说明" --json
qkrpc action update --code <sharedActionGuid> --json
```

## 开发

```powershell
dotnet build QuickerRpc.slnx
```

插件引用 Quicker 程序集 via 仓库根目录 `qkref.props`（默认 `C:\Program Files\Quicker`）。调试时可：

```powershell
dotnet build QuickerRpc.Plugin -p:QuickerDllPath="D:\path\to\Quicker\bin\x64\Debug\net472"
```

## 参考

- Quicker API（更新动作）：`wpf-demos/quicker-modifier` → `ActionEditService.UpdateActionAsync`
- StreamJsonRpc 管道模式：`CeaQuickerTools/IntelliTools` → `IntelliToolsQuickerRpcServer`
