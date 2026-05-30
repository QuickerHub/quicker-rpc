# quicker-rpc — 给 AI Agent 的快速说明

Quicker 插件 + `qkrpc.exe` CLI，通过 **命名管道 + StreamJsonRpc** 让外部命令行调用 Quicker 内能力。

详细用法见 [README.md](README.md)。

## 发布

```powershell
.\build.ps1
```

或仅 CLI：`.\publish\publish-rpc.ps1`

配置：`build.yaml`、`version.json`（`versionKey: QuickerRpc`）。

| 产物 | 路径 |
|------|------|
| CLI | `publish/cli/qkrpc.exe`（追加用户 PATH） |
| 插件 | `publish/plugin/QuickerRpc.Plugin.*.dll` |

## 管道

- 名：`QuickerRpc_Server_QRPC2026`（`QuickerRpcPipeNames.ServerPipe`）
- 插件 **host server**，CLI **client connect**

## Quicker 加载插件

```text
load {packagePath}/QuickerRpc.Plugin.{version}.dll
type QuickerRpc.Plugin.AssemblyLoader, QuickerRpc.Plugin.{version}
```

`Register()` 会 `Launcher.EnsureStarted()` 启动 RPC 监听。

## CLI

```powershell
qkrpc ping --json
qkrpc action update --id <guid> [--changelog "..."] --json
```

退出码：0 成功，1 失败。

## 模块

| 项目 | 职责 |
|------|------|
| `QuickerRpc.Contracts` | `IQuickerRpcService`、管道名、StreamJsonRpc 辅助 |
| `QuickerRpc.Plugin` | Quicker 内插件：RPC 服务端 + `ActionUpdateService` |
| `QuickerRpc.Console` | `qkrpc.exe` 客户端 |

更新动作实现：`ActionEditMgr.UpdateSharedActionAsync`（反射，internal 类型）。

## 参考

- `wpf-demos/quicker-modifier` → `ActionEditService`
- `CeaQuickerTools/IntelliTools` → `IntelliToolsQuickerRpcServer`
