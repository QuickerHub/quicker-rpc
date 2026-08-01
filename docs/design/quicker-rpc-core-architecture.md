# QuickerRpc 核心架构

> 当前架构入口。代码和测试是行为事实源；V1/V2 的能力状态见
> [Plugin.V2 对齐计划](quicker-rpc-plugin-v2.md)。

## 请求链路

```text
QuickerAgent / CLI / MCP / HTTP
  -> Contracts + Transport
  -> Runtime
  -> Host.Abstractions
  -> Plugin.V1 (net472) 或 Plugin.V2 (net10)
  -> Quicker
```

| 项目 | 职责 | 不应包含 |
|---|---|---|
| `QuickerRpc.Contracts` | wire DTO 和 RPC service contract | Quicker 实现类型 |
| `QuickerRpc.Transport` | 命名管道、StreamJsonRpc、连接/bootstrap | 业务编排 |
| `QuickerRpc.Runtime` | RPC 用例编排、错误和 capability 映射 | V1/V2 分支与 Quicker 反射 |
| `QuickerRpc.Host.Abstractions` | `IQuickerRpcHost`、领域端口和宿主 DTO | 具体宿主实现 |
| `QuickerRpc.AgentModel` | 程序压缩/patch、动作编写知识 | 进程内宿主调用 |
| `QuickerRpc.Plugin.V1` | net472 端口适配、调度与宿主集成 | 客户端命令解析 |
| `QuickerRpc.Plugin.V2` | net10 端口适配、DI 和反射兼容 | 独立 wire 协议 |
| `QuickerRpc.Console` | CLI、MCP、HTTP serve | Quicker 版本差异 |

## 边界规则

1. `Runtime` 只依赖 Host 端口，不判断 V1/V2。
2. Quicker 类型、反射和 UI 线程规则只存在于所属 Plugin adapter。
3. 可选能力由 `IQuickerRpcHostCapabilities` 如实声明；stub 不得标记为可用。
4. 写操作保留 `editVersion`、Designer 打开保护和结构化错误语义。
5. CLI、MCP 与 HTTP 复用同一 Runtime；新增入口不得复制业务实现。
6. wire DTO 或错误形状变更必须补 Contracts/Transport/Console 契约测试。

## 修改路由

| 修改内容 | 主要入口 | 验证重点 |
|---|---|---|
| RPC DTO/方法 | `Contracts/`、`Transport/` | transport/console contract tests |
| 通用业务行为 | `Runtime/` | runtime tests，V1/V2 不应分叉 |
| 程序压缩/patch | `AgentModel/` | round-trip、schema、生成文档检查 |
| net472 宿主 | `Plugin.V1/` | plugin tests + 活进程 smoke |
| net10 宿主 | `Plugin.V2/` | composition/probe tests + 活进程 smoke |
| CLI/MCP/serve | `Console/` | CLI help、MCP output、HTTP contract tests |

构建和热更新命令以根 [AGENTS.md](../../AGENTS.md) 为准。产品能力与规划只在
[产品文档](../product/README.md#p-rpc) 维护。
