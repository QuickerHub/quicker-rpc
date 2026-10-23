# QuickerRpc.Plugin.V2 能力对齐计划

> 状态：net10 对齐中。当前已有可运行 adapter，但仍存在 stub 与关闭 capability；不得描述为与 net472 完全对齐。

## 目标

在不复制 Runtime 业务逻辑的前提下，使 `QuickerRpc.Plugin.V2` 对 V1/net472 已开放的 qkrpc 能力做到：

1. 同一 Contracts DTO 和 Runtime handler。
2. 相同行为、错误语义与 capability 声明。
3. V2 宿主不具备的能力有明确“不支持”决策，而不是假成功或长期 stub。
4. 离线 composition/probe 与真实 Quicker V2 活进程验证同时通过。

用户已将近期重点调整为自动识别 V1/V2、迁入 Quicker 新动作设计器、统一 Agent 写动作。
交付顺序以 [主线计划](../product/README.md#统一-rpc-与动作设计器当前主线) 为准；本文继续维护
V2 adapter 的真实能力与对齐门槛。动作编辑链优先于分享、Chrome 等其余完整 parity，
不能因尚有无关能力 stub 而推迟设计器迁移，也不能提前开放未实现操作。

## 当前结构

```text
QuickerRpc.Plugin.V2
  -> V2QuickerRpcHost
    -> core adapters / catalog / run / settings / launcher / docs
    -> reflection accessors for current Quicker V2 host
    -> optional external IQuickerRpcHost when Quicker provides one
  -> shared QuickerRpc.Runtime
  -> shared QuickerRpc.Transport
```

| 范围 | 代码入口 |
|---|---|
| 组合与启动 | `QuickerRpc/src/QuickerRpc.Plugin.V2/PluginV2BootstrapStack.cs`、`Composition/` |
| capability | `Adapters/V2QuickerRpcHostCapabilities.cs` |
| 核心端口 | `Adapters/V2CoreHosts.cs` |
| 搜索/目录/运行/设置/说明/Launcher | `Adapters/V2*Host.cs` |
| 当前缺口 | `Adapters/V2StubHosts.cs` 与其它 `V2StubMessage.NotImplemented` 调用点 |
| Quicker V2 访问 | `Reflection/QuickerV2*` |
| 离线验证 | `QuickerRpc/tests/QuickerRpc.Runtime.Test/*V2*Tests.cs` |

## 能力矩阵

| 端口/能力 | 当前 V2 | 对齐要求 |
|---|---|---|
| Session | 已有 adapter | 与 V1 health/session 语义一致 |
| ActionPrograms | 已有旧 body/get/patch 与 Designer 打开保存保护；未实现 native source host，YAML open/save 当前 unsupported | 补 `IQuickerRpcActionProgramSourceHost`、typed/native body 与 codec bridge；roundtrip、storage identity/revision、Designer guard、错误和部分保存语义一致 |
| SubPrograms | 已有读写/同步路径 | create/update/delete/publish 逐项验证 |
| ActionRuns/trace | 已有 V2 run/trace service | 普通运行、trace、失败位置与取消一致 |
| ActionCatalog/Search | 已有查询/搜索；部分布局操作 stub | action/profile/layout 操作逐项清零或决策不支持 |
| Settings/ActionDocs/StepRunners/Launcher | 已有 adapter | 与对应 V1 命令做 parity smoke |
| ActionSharing | 仍有 stub | publish/update/preflight 完成或明确宿主边界 |
| Expressions | 已接共享表达式服务 | 按实际 V1/V2 行为验证，不再按未实现处理 |
| ChromeControl | `false`/`null` | 实现后再开启 capability |
| Triggers | `false`/`null` | 实现后再开启 capability |
| Designer UI | `false`/`null` | 只有真正支持打开/内存态保护后开启 |

## 自动识别与设计器接入优先项

1. 将已有 `IQuickerRpcHost.Info` 与实际逐操作 capability 暴露为 wire 握手，建立实例发现与
   session 绑定；当前两插件共用固定 pipe，不能据此确认连到哪个版本。
2. Designer 初期复用 Quicker 的结构化编辑会话、`ActionStorageIdentity`、预期编辑版本与
   host persistence 语义；适配 V1/V2，而不是将 V1 压缩 Agent JSON 当作完整设计器文档。
3. 补 V2 native source 后再开放 YAML；已有 `TrySaveAction` 的编辑器打开检查继续保留。
4. Runtime 所有可选端口先检查支持性；当前部分 `_host.Designer!` 路径需要改为结构化
   unsupported，不能让 null port 变成空引用异常。
5. 分别在 V1/V2 专用测试动作上验收读取、编辑、校验、保存、重读、冲突和重启；写入不对
   另一个实例自动重试。其余 capability 逐项继续下表流程，不冒充全量 parity。

## 对齐工作顺序

1. 从 Contracts 的 host port 与 V1 adapter 建立逐方法清单。
2. 搜索 V2 中全部 `V2StubMessage.NotImplemented`、`NotSupportedException`、null capability。
3. 先补共享 Runtime 已有 handler 所需的 host adapter，不在 V2 复制 handler。
4. 每补一个端口，增加成功、失败和 capability 三类测试。
5. 使用同一 CLI/MCP 输入分别运行 V1/V2，比较结构化输出和副作用。
6. 最后处理 Designer/ChromeControl/Triggers 等宿主 UI 或可选能力。

## 完成门槛

- V1 当前公开命令均进入矩阵，并有“等价/明确不支持”结论。
- V2 可用路径不再返回 `V2StubMessage.NotImplemented`。
- capability 与实际注入 adapter 一致，不出现 capability=true 但调用失败。
- `PluginV2CompositionTests`、V2 catalog/probe tests 和相关 Runtime tests 全部通过。
- 对动作读写、子程序、运行/trace、搜索、设置等主流程完成活进程 smoke。
- 构建/发布配置只包含必要 runtime 依赖，包体积单独核验；不能用能编译代替能力对齐。

## 验证

```powershell
dotnet test QuickerRpc/tests/QuickerRpc.Runtime.Test -c Release --filter "FullyQualifiedName~V2|FullyQualifiedName~QuickerV2"
```

修改 V2 插件后还需按根 `AGENTS.md` 执行目标构建/热更新和活进程验证。产品状态同步更新到 [RPC](../product/README.md#p-rpc)。
