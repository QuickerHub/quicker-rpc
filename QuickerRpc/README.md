# QuickerRpc/

RPC 技术栈分层目录。架构说明见 [docs/design/quicker-rpc-core-architecture.md](../docs/design/quicker-rpc-core-architecture.md)。

| 项目 | 职责 |
|------|------|
| `QuickerRpc.Transport/` | 命名管道 + StreamJsonRpc 客户端/服务端 |
| `QuickerRpc.Runtime/` | `QuickerRpcService` 薄编排 + ActionProgram/SubProgram handlers |
| `QuickerRpc.Plugin.V1/` | net472 插件（V1 adapters + DI；输出 DLL 名仍为 `QuickerRpc.Plugin`） |
| `QuickerRpc.Plugin.V2/` | net10 插件脚手架（AppState → `IQuickerRpcHost`，随 Quicker V2 发行） |

根目录仍保留 wire 契约与共享抽象：

| 项目 | 职责 |
|------|------|
| `../QuickerRpc.Contracts/` | `IQuickerRpcService` 与 wire DTO |
| `../QuickerRpc.Host.Abstractions/` | `IQuickerRpcHost` 统一端口 |
| `../QuickerRpc.AgentModel/` | XAction 压缩/patch、搜索索引 |

输出 DLL 名仍为 **`QuickerRpc.Plugin.{version}.dll`**（`AssemblyName` 未改），与 `quicker.rpc` 包加载兼容。
