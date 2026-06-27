# QuickerRpc.Plugin.V2 设计

> 状态：脚手架（2026-06-27）  
> 前置：Phase 0–3 完成；**P4.1 Quicker 主仓 Infrastructure 未就绪**  
> 关联：[quicker-rpc-core-architecture.md](./quicker-rpc-core-architecture.md)

## 目标

- net10 进程内插件：**无 Quicker 反射**，仅 `AppState.GetService<IQuickerRpcHost>()`
- 复用 `QuickerRpc.Runtime`（`QuickerRpcService`）+ `QuickerRpc.Transport`（命名管道）
- **无** Designer / WPF / Headless* 端口实现

## 依赖关系

```text
Quicker.exe (V2)
  └─ Quicker.Infrastructure.QuickerRpc.Host  → IQuickerRpcHost
  └─ QuickerRpc.Plugin.V2 (this)
        └─ QuickerRpc.Runtime.QuickerRpcService
        └─ QuickerRpc.Transport.QuickerRpcServerHost
```

## 启动流程

1. Quicker 启动时 `AddQuickerRpcHostV2()` 注册 `IQuickerRpcHost`
2. 插件 `Runner.StartRpcServer()` → `QuickerAppStateHostResolver.ResolveRequired()`
3. `PluginV2ServiceCollectionExtensions.AddQuickerRpcPluginV2(host)` 注册 RPC
4. `QuickerRpcServerHost` 监听 `QuickerRpcPipeNames.ServerPipe`

## Capabilities（V2）

| 端口 | V2 |
|------|-----|
| Session, ActionPrograms, SubPrograms, ActionRuns, … | Infrastructure 实现 |
| Designer | **null**（`Capabilities.DesignerUi = false`） |
| ChromeControl / Triggers | 视 Infrastructure 注册 |

## 待办（P4.1+）

| ID | 仓库 | 任务 |
|----|------|------|
| P4.1 | Quicker | `Quicker.Infrastructure.QuickerRpc.Host` 实现全部 required 端口 |
| P4.1b | Quicker | `IQuickerRpcStepRunnerHost` → `StepRunnerCatalog` 供 Runtime 压缩 |
| P4.2 | qkrpc | ✅ `QuickerRpc.Plugin.V2` 脚手架 |
| P4.3 | qkrpc | V2 集成测试（mock `IQuickerRpcHost` + 活进程） |
| P4.4 | 发布 | V2 随 Quicker 发行；V1 `quicker.rpc` 维护至覆盖完成 |

## 构建

```powershell
dotnet build QuickerRpc/QuickerRpc.Plugin.V2/QuickerRpc.Plugin.V2.csproj -c Release
```

**不**纳入 `build.yaml` / `quicker.rpc` 包；V2 由 Quicker 主仓引用或复制 DLL。
