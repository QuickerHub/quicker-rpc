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
| `QuickerRpc.AgentModel` | YAML source codec、程序压缩/patch、动作编写知识 | 进程内宿主调用 |
| `QuickerRpc.Plugin.V1` | net472 端口适配、调度与宿主集成 | 客户端命令解析 |
| `QuickerRpc.Plugin.V2` | net10 端口适配、DI 和反射兼容 | 独立 wire 协议 |
| `QuickerRpc.Console` | CLI、MCP、HTTP serve | Quicker 版本差异 |

## YAML source 与原生程序端口

动作 source 的读写不经过旧 compressed/protobuf 投影：

```text
program.source.yaml / files/*
  <-> AgentModel.XAction.Source.ProgramSourceCodec
  <-> V1ProgramSourceCodec + Console.ActionSourceWorkspace（原生基线、身份与版本）
  <-> Contracts.GetActionProgramSourceAsync / ApplyActionProgramSourceAsync
  <-> Transport / Runtime
  <-> 可选 IQuickerRpcActionProgramSourceHost
  <-> Plugin adapter / Quicker catalog
```

`ProgramSourceCodec` 负责 YAML 与 canonical source wire 的可逆转换；
`V1ProgramSourceCodec` 用原生 JSON 基线恢复宿主字段及未知字段。两者都在
[`AgentModel/XAction/Source`](../../QuickerRpc/src/QuickerRpc.AgentModel/XAction/Source/)，
不调用 Quicker 宿主。客户端在
[`ActionSourceWorkspace`](../../QuickerRpc/src/QuickerRpc.Console/ActionSourceWorkspace.cs)
保存身份、`editVersion` 和私有基线；`--dry-run` 的编译不需要连接插件。

Runtime 只检查宿主动作端口是否实现
[`IQuickerRpcActionProgramSourceHost`](../../QuickerRpc/src/QuickerRpc.Host.Abstractions/IQuickerRpcActionProgramSourceHost.cs)，
缺少该端口时返回 `UNSUPPORTED_HOST`。具体 adapter 负责 catalog 原始读取和
UI 调度内的 Designer 检查、版本校验及保存。当前原生保存器只合并
`steps`、`variables`、`subPrograms`，保留 catalog 根身份和元数据；修改其它根字段
返回 `SOURCE_FIELD_READ_ONLY`。`force` 不能绕过 Designer 打开保护。

## 边界规则

1. `Runtime` 只依赖 Host 端口，不判断 V1/V2。
2. Quicker 类型、反射和 UI 线程规则只存在于所属 Plugin adapter。
3. 可选能力由 `IQuickerRpcHostCapabilities` 如实声明；stub 不得标记为可用。
4. 写操作保留 `editVersion`、Designer 打开保护和结构化错误语义。
5. CLI、MCP 与 HTTP 复用同一 Runtime；新增入口不得复制业务实现。
6. wire DTO 或错误形状变更必须补 Contracts/Transport/Console 契约测试。

V1/net472 Release 的全部自有程序集（Plugin、Contracts、AgentModel、Host.Abstractions、
Runtime、Transport）使用同一四段版本作为程序集名称后缀。Costura 嵌入依赖时仍须保留
这些独立名称，才能让新旧热更新版本在同一 Quicker 进程中共存；遗漏接口程序集的后缀会
让旧接口绑定旧 DTO，导致新 adapter 加载时报方法未实现。netstandard2.0 的 CLI 依赖保留短名称。

## 修改路由

| 修改内容 | 主要入口 | 验证重点 |
|---|---|---|
| RPC DTO/方法 | `Contracts/`、`Transport/` | transport/console contract tests |
| 通用业务行为 | `Runtime/` | runtime tests，V1/V2 不应分叉 |
| YAML codec、程序压缩/patch | `AgentModel/` | round-trip、schema、生成文档检查 |
| net472 宿主 | `Plugin.V1/` | plugin tests + 活进程 smoke |
| net10 宿主 | `Plugin.V2/` | composition/probe tests + 活进程 smoke |
| CLI/MCP/serve | `Console/` | CLI help、MCP output、HTTP contract tests |

source 链路的离线验证入口（从仓库根执行）：

```powershell
dotnet test QuickerRpc/tests/QuickerRpc.Transport.Test -c Release
dotnet test QuickerRpc/tests/QuickerRpc.Runtime.Test -c Release -p:IncludeV2HostTests=false --filter FullyQualifiedName~ActionProgramSourceRpcTests
dotnet test QuickerRpc/tests/QuickerRpc.Plugin.Test -c Release --filter FullyQualifiedName~NativeActionProgramSourceBodyTests
dotnet test QuickerRpc/tests/QuickerRpc.Console.Test -c Release --filter "FullyQualifiedName~ProgramSourceCodecTests|FullyQualifiedName~ActionSourceWorkspaceTests"
```

Transport 测试使用隔离的随机命名管道，通过实际 `IQuickerRpcService` proxy 和
`StreamJsonRpcFactory` 验证请求参数、完整原生 JSON、警告及结构化错误的往返。
Runtime 的 `IncludeV2HostTests` 默认保持 `true`；设为 `false` 只排除依赖 V2
插件及宿主程序集的测试，便于验证独立 Runtime，不替代 V2 的编译和探针检查。

构建和热更新命令以根 [AGENTS.md](../../AGENTS.md) 为准。产品能力与规划只在
[产品文档](../product/README.md#p-rpc) 维护。
