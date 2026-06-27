# QuickerRpc/

RPC 产品目录（插件 + `qkrpc` CLI + wire 技术栈）。打开 **`QuickerRpc.slnx`** 即可开发。

```text
QuickerRpc/
  src/          # QuickerRpc.* 源码项目
  lib/          # Quicker.ActionRuntime 子模块（Console 编译依赖）
  tests/        # 单元 / 集成测试
  build.yaml    # qkbuild 插件
  build.ps1     # 热更新（monorepo 根 build.ps1 转发至此）
  version.json  # 插件版本 / MSBuild RepoRoot
```

架构说明：[docs/design/quicker-rpc-core-architecture.md](../docs/design/quicker-rpc-core-architecture.md)

| 项目 | 职责 |
|------|------|
| `src/QuickerRpc.Transport/` | 命名管道 + StreamJsonRpc |
| `src/QuickerRpc.Runtime/` | `QuickerRpcService` 薄编排 |
| `src/QuickerRpc.Plugin.V1/` | net472 插件（输出 `QuickerRpc.Plugin.{version}.dll`） |
| `src/QuickerRpc.Plugin.V2/` | net10 脚手架（随 Quicker V2） |
| `src/QuickerRpc.Console/` | `qkrpc` CLI |

```powershell
# 从 monorepo 根
pwsh ./build.ps1 -t

# 或仅产品目录
cd QuickerRpc
dotnet build QuickerRpc.slnx -c Release
```
