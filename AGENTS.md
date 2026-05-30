# quicker-rpc — 给 AI Agent 的快速说明

Quicker 插件 + `qkrpc.exe` CLI，通过 **命名管道 + StreamJsonRpc** 让外部命令行调用 Quicker 内能力。

**CLI 自描述（优先）**：`qkrpc help --json` — 命令、参数、示例、错误码、JSON 响应形状。

详细用法见 [README.md](README.md)。

## 发布

```powershell
.\build.ps1
.\build.ps1 -p          # Quicker 依赖上传 + 版本 bump
.\build.ps1 -p -n       # 上传但不改 version.json

# CLI → GitHub Releases
.\publish\Publish-GitHubRelease.ps1
```

或仅 CLI：`.\publish\publish-rpc.ps1`

配置：`build.yaml`、`version.json`（`versionKey: QuickerRpc`）。

**用户安装（一条命令，需先发布 Release）：**

```powershell
irm https://raw.githubusercontent.com/QuickerHub/quicker-rpc/main/publish/install.ps1 | iex
```

**Cursor**：改代码后测试构建见 `.cursor/skills/quicker-rpc-build-test/SKILL.md`（默认 `build.ps1 -t`）；发布编排见 `.cursor/skills/quicker-rpc-publish/SKILL.md`；命令 `/publish`、`/publish-build`、`/publish-quicker`、`/publish-cli`（`.cursor/commands/`）。

| 产物 | 路径 |
|------|------|
| CLI | `publish/cli/qkrpc.exe`（开发机追加用户 PATH） |
| CLI zip | `publish/qkrpc-{version}-win-x64.zip`（GitHub Releases） |
| 插件 | `publish/plugin/QuickerRpc.Plugin.*.dll` |

## 管道

- 名：`QuickerRpc_Server_QRPC2026`（`QuickerRpcPipeNames.ServerPipe`）
- 插件 **host server**，CLI **client connect**

## Quicker 加载插件

```text
load {packagePath}/QuickerRpc.Plugin.{version}.dll
type QuickerRpc.Plugin.AssemblyLoader, QuickerRpc.Plugin.{version}
```

`Register()` 会 `Launcher.Start()` 启动 RPC 监听。

## CLI

```powershell
qkrpc help --json          # machine-readable reference (preferred for agents)
qkrpc ping --json
qkrpc action search --query "<keyword>" [--limit 20] --json
qkrpc action edit --id <guid> --json
qkrpc action delete --id <guid> --yes --json
qkrpc action update --id <guid> [--changelog "..."] [--changelog-file <path>] --json
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
