# ActionRuntime P6 — Quicker 切主计划

> 日期：2026-06-11  
> 前置：quicker-rpc P0–P5 完成（全部 migratable keys 已注册 V2 壳）  
> Canonical 宿主：`quickerorg/Quicker/QuickerPc`

## 1. 目标

1. Quicker `ActionExecutionService` 默认通过 `IActionRuntime.Execute` 运行动作程序体。
2. `XActionRunner` 主循环退役为薄回落层（仅处理 `ActionRuntimeRouting` 未覆盖的 key）。
3. `Quicker.Host.Adapters` 注入真实 `I*Operations` + `IHostServices`。

## 2. quicker-rpc 已交付（P6 准备）

| 组件 | 路径 | 用途 |
|------|------|------|
| `ActionRuntimeRouting` | `Quicker.ActionRuntime.Integration/ActionRuntimeRouting.cs` | 与 `ModuleRegistry.RegisteredKeys` 同源的切主判定 |
| `StepMigrationCatalog` | `Integration/StepMigrationCatalog.cs` | 142 中已迁移 / 刻意排除列表 |
| `StepImplementationTierCatalog` | `Integration/StepImplementationTier.cs` | Full / Partial / MockOnly 支持度 |
| `ActionRuntimeExecutor` | `Integration/ActionRuntimeExecutor.cs` | 宿主侧薄封装 |
| `PackageSupportAnalyzer` | 执行前诊断未注册 key | |

## 3. QuickerPc 实施步骤

### 3.1 同步 ActionRuntime 源码

将 quicker-rpc `Quicker.ActionRuntime/**` 同步至 `QuickerPc/Quicker.ActionRuntime/**`（或改为包引用），确保 V2 壳与 P5 Pack 一致。

### 3.2 新建 `Quicker.Host.Adapters`

```
Quicker.Host.Adapters/
  QuickerHostServices.cs          # IHostServices → WPF/Win32
  QuickerOperationsBundle.cs      # I*Operations 真实实现聚合
  ActionExecutionPackageBuilder.cs # IActionExecuteContext → ActionExecutionPackage
  RuntimeExecutionResultApplier.cs # RuntimeExecutionResult → context 输出/停止标志
```

`ActionExecutionPackageBuilder` 提取：

- `XAction` 程序树（含 SubPrograms）
- `InputParam`、`InitialVars`
- `Options.IsDebugging`、日志 sink
- `HostServices`、`OperationsBundle`

### 3.3 修改 `ActionExecutionService`

```csharp
// 伪代码 — 动作级切主（推荐首版）
var package = _packageBuilder.Build(xAction, executeContext);
var support = PackageSupportAnalyzer.Analyze(package, _actionRuntime);
if (!support.IsFullySupported)
{
    return _legacyRunner.Run(xAction, executeContext); // 回落
}

using (RuntimeServices.Push(_operationsBundle.ToContainer()))
{
    var result = _actionRuntime.Execute(package);
    _resultApplier.Apply(executeContext, result);
}
```

灰度开关：`UserSettings2.ActionExecution.UseActionRuntimeEngine`（默认 `false`）；环境变量 `QUICKER_USE_ACTION_RUNTIME=1|true` 优先启用，`0|false` 强制关闭。

### 3.4 退役 `XActionRunner` 主循环

首版保留 `XActionRunner` 类，`ExecuteXAction` 与 `RunChildSteps` 均尝试切主：

1. 整程序 `PackageSupportAnalyzer.IsFullySupported` → `ExecuteXAction` 不进入 legacy 逐步路径。
2. legacy `RunChildSteps` 对当前步骤片段做 `AnalyzeFragment`（忽略未引用的子程序）→ 全支持则片段切主。
3. 逐步回落：`ActionRuntimeRouting.IsHandledByActionRuntime(key)` 为 true 且子树 `AnalyzeFragment` 通过 → 单步 ActionRuntime；否则 legacy `step.Execute`（✅ 已接入）。

最终版：删除逐步 legacy，`XActionRunner` 仅作 `ActionExecuteContext` 适配器。

### 3.5 DI 注册

```csharp
services.AddSingleton<IActionRuntime>(_ => ActionRuntimeBootstrap.CreateScriptingRuntime(...));
services.AddSingleton<ActionRuntimeRouting>(_ => ActionRuntimeRouting.CreateDefault());
services.AddSingleton<QuickerOperationsBundle>();
services.AddSingleton<ActionExecutionPackageBuilder>();
services.AddSingleton<RuntimeExecutionResultApplier>();
```

## 4. 验证清单

- [x] `StepMigrationCoverageTests` / `ActionRuntimeRoutingTests`（quicker-rpc）
- [x] Quicker net10 编译 + `XActionRunner` 切主入口
- [x] `RuntimeOperationsBundleFactory` + 状态存储 backend
- [x] QuickerPc 同路径测试套件（Cutover / SubProgramScope / StepMigration 子集）
- [ ] 精选动作：Comment / If / SubProgram / HTTP / Excel 与 legacy 输出一致
- [ ] Debug 模式日志写入 `RuntimeExecutionResult.Logs`
- [ ] `sys:webview2` 等 excluded key 仍走 legacy，不崩溃
- [ ] `PackageSupportAnalyzer` 对混合程序给出正确 unsupported 列表

## 5. 非目标（本 Phase）

- Named Pipe / 跨进程执行
- 删除 Quicker 内 `*StepV2.Definition.cs`
- 一次性删除全部 `*StepV2.Execute.cs`（可分批改为空壳委托）

## 6. 回滚策略

- 配置开关切回 `XActionRunner` 全路径
- `ActionRuntimeRouting` 与 Registry 同源，无第二份 key 列表需维护
