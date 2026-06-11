# ActionRuntime V2 迁移 — Phase P0 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 `RuntimeAttributeStepModule` 执行壳、`IOperationsAccessor` DI 规范，并以 `sys:http` 完成端到端示范迁移，为后续 Pack 批量迁移提供模板。

**Architecture:** 步骤壳（V2 对齐）→ `I*Operations` 契约 → Core 真实现 / Testing Mock / Quicker Host 实现。详见 [spec](../specs/2026-06-11-actionruntime-v2-migration-design.md)。

**Tech Stack:** .NET 10, 现有 `RuntimeServices` AsyncLocal DI, `StepParamReader`（迁移期共存）

**关联文档:** `Quicker.ActionRuntime/docs/module-operations-api-design.md`, `Quicker.ActionRuntime/docs/execution-equivalence-testing.md`

---

## File map (P0)

| 文件 | 职责 |
|------|------|
| `Quicker.ActionRuntime.Abstractions/IRuntimeOperations.cs` | `IOperationsAccessor`, `IRuntimeOperationsBundle` |
| `Quicker.ActionRuntime.Abstractions/IRuntimeContext.cs` | 增加 `Operations` 属性 |
| `Quicker.ActionRuntime.Core/RuntimeStepParams.cs` | Params 基类 |
| `Quicker.ActionRuntime.Core/RuntimeAttributeStepModule.cs` | V2 执行壳 |
| `Quicker.ActionRuntime.Core/RuntimeStepParamsFactory.cs` | 从 ActionStep + IRuntimeContext 构造 Params |
| `Quicker.ActionRuntime.Core/RuntimeOperationsAccessor.cs` | 从 `RuntimeServices` 解析 |
| `Quicker.ActionRuntime.Core/RuntimeServiceContainer.cs` | 扩展 `GetRequired<T>()` |
| `Quicker.ActionRuntime.Core/Modules/Network/HttpStepModuleV2.cs` | 示范步骤（新壳） |
| `tests/.../RuntimeAttributeStepModuleTests.cs` | 壳行为单测 |
| `tests/.../HttpStepModuleV2Tests.cs` | HTTP 端到端 |
| `Quicker.ActionRuntime/docs/step-migration-guide.md` | 更新迁移模板 |

---

### Task 1: Operations 访问契约

**Files:**
- Create: `Quicker.ActionRuntime.Abstractions/IRuntimeOperations.cs`
- Modify: `Quicker.ActionRuntime.Abstractions/IRuntimeContext.cs`

- [ ] **Step 1: 添加接口**

```csharp
namespace Quicker.ActionRuntime.Abstractions;

public interface IOperationsAccessor
{
    T GetRequired<T>() where T : class;
    bool TryGet<T>(out T service) where T : class;
}

public interface IRuntimeOperationsBundle
{
    void Register<T>(T implementation) where T : class;
    RuntimeServiceContainer ToContainer();
}
```

- [ ] **Step 2: 扩展 IRuntimeContext**

在 `IRuntimeContext` 增加：

```csharp
IOperationsAccessor Operations { get; }
```

- [ ] **Step 3: 构建验证**

```powershell
dotnet build Quicker.ActionRuntime/Quicker.ActionRuntime.Abstractions -c Release
```

Expected: 0 errors

---

### Task 2: RuntimeStepParams 基类

**Files:**
- Create: `Quicker.ActionRuntime.Core/RuntimeStepParams.cs`

- [ ] **Step 1: 实现基类**

```csharp
using Quicker.ActionRuntime.Abstractions;
using Quicker.ActionRuntime.Abstractions.Models;

namespace Quicker.ActionRuntime.Core;

public abstract class RuntimeStepParams
{
    protected RuntimeStepParams(ActionStep step, IRuntimeContext context)
    {
        Step = step ?? throw new ArgumentNullException(nameof(step));
        Context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public ActionStep Step { get; }
    public IRuntimeContext Context { get; }

    public bool StopIfFail =>
        StepParamReader.ReadInputBoolean(Context, Step, "stopIfFail", defaultValue: true);

    public virtual void ApplyStandardOutputs(StepResult result)
    {
        if (Step.OutputParams.ContainsKey("isSuccess"))
        {
            StepParamReader.WriteOutput(Context, Step, "isSuccess", result.IsSuccess);
        }
        if (Step.OutputParams.ContainsKey("errorMessage") && !result.IsSuccess)
        {
            StepParamReader.WriteOutput(Context, Step, "errorMessage", result.Message ?? string.Empty);
        }
    }
}
```

- [ ] **Step 2: 工厂**

Create `RuntimeStepParamsFactory.cs`:

```csharp
namespace Quicker.ActionRuntime.Core;

public static class RuntimeStepParamsFactory
{
    public static TParams Create<TParams>(ActionStep step, IRuntimeContext context)
        where TParams : RuntimeStepParams
    {
        return (TParams)Activator.CreateInstance(typeof(TParams), step, context)!;
    }
}
```

- [ ] **Step 3: 单测 — Params 构造**

Create `tests/Quicker.ActionRuntime.Tests/RuntimeStepParamsTests.cs`:

```csharp
[TestMethod]
public void StopIfFail_defaults_true_when_param_missing()
{
    var ctx = TestRuntimeContext.Create();
    var step = new ActionStep { StepRunnerKey = "sys:comment" };
    var p = new TestParams(step, ctx);
    Assert.IsTrue(p.StopIfFail);
}
```

---

### Task 3: RuntimeAttributeStepModule 执行壳

**Files:**
- Create: `Quicker.ActionRuntime.Core/RuntimeAttributeStepModule.cs`

- [ ] **Step 1: 实现抽象基类**

```csharp
using Quicker.ActionRuntime.Abstractions;
using Quicker.ActionRuntime.Abstractions.Models;

namespace Quicker.ActionRuntime.Core;

public abstract class RuntimeAttributeStepModule<TParams> : IStepModule
    where TParams : RuntimeStepParams
{
    public abstract string StepRunnerKey { get; }

    public StepResult Execute(ActionStep step, IRuntimeContext context)
    {
        var p = RuntimeStepParamsFactory.Create<TParams>(step, context);
        StepResult result;
        try
        {
            result = ExecuteInternal(p);
        }
        catch (Exception ex)
        {
            context.Logger.Error(ex.Message);
            result = StepResult.Failed(ex.Message);
        }

        p.ApplyStandardOutputs(result);

        if (!result.IsSuccess && p.StopIfFail)
        {
            context.Stop(ActionStopFlag.OperationFailed, result.Message ?? "步骤失败");
        }

        return result;
    }

    protected abstract StepResult ExecuteInternal(TParams p);
}
```

- [ ] **Step 2: 单测 — 异常与 stopIfFail**

```csharp
[TestMethod]
public void Execute_sets_stop_flag_when_stopIfFail_and_failed()
{
    var ctx = TestRuntimeContext.Create();
    var step = new ActionStep
    {
        StepRunnerKey = "test:fail",
        InputParams = new Dictionary<string, ActionStepParam>
        {
            ["stopIfFail"] = new() { Value = "true" },
        },
    };
    var module = new FailingTestModule();
    module.Execute(step, ctx);
    Assert.AreEqual(ActionStopFlag.OperationFailed, ctx.StopFlag);
}
```

---

### Task 4: Operations 解析接入 RuntimeContext

**Files:**
- Modify: `Quicker.ActionRuntime.Core/RuntimeContext.cs`
- Create: `Quicker.ActionRuntime.Core/RuntimeOperationsAccessor.cs`

- [ ] **Step 1: RuntimeOperationsAccessor**

```csharp
namespace Quicker.ActionRuntime.Core;

internal sealed class RuntimeOperationsAccessor : IOperationsAccessor
{
    public T GetRequired<T>() where T : class
    {
        if (RuntimeServices.TryResolve<T>(out var svc))
        {
            return svc;
        }
        throw new InvalidOperationException($"Operation service {typeof(T).Name} is not registered.");
    }

    public bool TryGet<T>(out T service) where T : class =>
        RuntimeServices.TryResolve(out service);
}
```

- [ ] **Step 2: RuntimeContext 暴露 Operations**

在 `RuntimeContext` 构造函数中：

```csharp
Operations = new RuntimeOperationsAccessor();
```

- [ ] **Step 3: ActionExecutionPackage 可选 Bundle**

Modify `ActionExecutionPackage.cs` — 增加可选字段：

```csharp
public IRuntimeOperationsBundle? OperationsBundle { get; init; }
```

`ExecutionEngine` 在 `Execute` 开头：

```csharp
using var opsScope = package.OperationsBundle?.ToContainer() is { } c
    ? RuntimeServices.Push(c)
    : null;
```

---

### Task 5: HttpStepModule V2 示范迁移

**Files:**
- Create: `Quicker.ActionRuntime.Core/Modules/Network/HttpStepModuleV2.cs`
- Modify: `Quicker.ActionRuntime.Core/ActionRuntimeModuleCatalog.cs`（注册新模块或替换旧模块）

- [ ] **Step 1: Params 类**

```csharp
public sealed class HttpStepModuleV2 : RuntimeAttributeStepModule<HttpStepModuleV2.Params>
{
    public const string StepKey = "sys:http";
    public override string StepRunnerKey => StepKey;

    public sealed class Params : RuntimeStepParams
    {
        public Params(ActionStep step, IRuntimeContext context) : base(step, context) { }

        public string Url => StepParamReader.ReadInputString(Context, Step, "url") ?? string.Empty;
        public string Method => StepParamReader.ReadInputString(Context, Step, "method") ?? "GET";
        public bool UseSse => StepParamReader.ReadInputBoolean(Context, Step, "useSSE");
        // ... 其余字段与现有 HttpStepModule 一致

        public void SetStatusCode(int value) => StepParamReader.WriteOutput(Context, Step, "statusCode", value);
        public void SetContent(string value) => StepParamReader.WriteOutput(Context, Step, "content", value);
    }

    protected override StepResult ExecuteInternal(Params p)
    {
        if (p.UseSse)
            return StepResult.Failed("SSE 流式响应需要 Quicker 宿主实现。");

        var http = p.Context.Operations.GetRequired<IHttpOperations>();
        var result = http.Execute(new HttpRequestOptions
        {
            Url = p.Url,
            Method = p.Method,
            // ...
        }, p.Context.Logger.Warning);

        p.SetStatusCode(result.StatusCode);
        p.SetContent(result.Content);
        return result.IsSuccess ? StepResult.Success : StepResult.Failed("HTTP 请求失败");
    }
}
```

- [ ] **Step 2: 注册并保留旧模块至对拍完成**

在 catalog 中暂时 **同时** 注册 `HttpStepModule` 与 `HttpStepModuleV2` 不可行（同 key 冲突）。策略：

1. 用 `HttpStepModuleV2` **替换** `HttpStepModule` 注册
2. 运行现有 `StepExecutionEquivalenceTests` 确保无回归

- [ ] **Step 3: 运行等价测试**

```powershell
dotnet test Quicker.ActionRuntime/tests/Quicker.ActionRuntime.Tests `
  --filter FullyQualifiedName~StepExecutionEquivalenceTests -c Release
```

Expected: PASS

---

### Task 6: 迁移指南文档

**Files:**
- Modify: `Quicker.ActionRuntime/docs/step-migration-guide.md`

- [ ] **Step 1: 添加 V2 壳迁移 checklist**

内容包括：

1. 从 Quicker `*StepV2.Execute.cs` 识别 `I*Operations` 调用点
2. 创建 `RuntimeAttributeStepModule<TParams>` 子类
3. Params 属性映射表（Key → 属性名）
4. Core / Mock / Quicker 三实现归属
5. 等价测试 + `EquivalenceMockConfigurator` 更新
6. 删除旧 `StepParamReader` 手写 `IStepModule`

---

### Task 7: PackageSupportAnalyzer 扩展（可选 P0）

**Files:**
- Modify: `Quicker.ActionRuntime.Integration/PackageSupportAnalyzer.cs`

- [ ] **Step 1: 增加 ImplementationTier 枚举**

```csharp
public enum StepImplementationTier
{
    Full,       // Core 真实现
    Partial,    // 有降级警告
    MockOnly,   // 仅测试 mock
    Unsupported,
}
```

- [ ] **Step 2: 为已迁移步骤维护 tier 映射表（先含 sys:http）**

---

## P0 完成定义

- [ ] `RuntimeAttributeStepModule` + `RuntimeStepParams` 合并入主分支
- [ ] `IRuntimeContext.Operations` 可用
- [ ] `sys:http` 使用新壳且等价测试通过
- [ ] `step-migration-guide.md` 含可复制的迁移模板
- [ ] Spec 状态更新为「P0 完成」

---

## 后续 Phase 索引（本计划不展开逐步代码）

| Phase | 计划文件 | 范围 |
|-------|----------|------|
| P1 | `2026-06-XX-actionruntime-p1-flow.md` | Flow + Expr ~18 keys |
| P2 | `2026-06-XX-actionruntime-p2-core-io.md` | Text/File/Network ~45 keys |
| P3 | `2026-06-XX-actionruntime-p3-host-ui.md` | UI/Clipboard ~20 keys |
| P4 | `2026-06-XX-actionruntime-p4-automation.md` | Automation ~25 keys |
| P5 | `2026-06-XX-actionruntime-p5-complex.md` | Heavy ~35 keys |
| P6 | `2026-06-XX-actionruntime-p6-quicker-cutover.md` | Quicker 切主 |

每个后续 Phase 在开始前单独编写 plan，复用 P0 模板。

---

## Self-review（plan ↔ spec）

| Spec 要求 | Plan 任务 |
|-----------|-----------|
| RuntimeAttributeStepModule | Task 3 |
| RuntimeStepParams | Task 2 |
| I*Operations DI | Task 1, 4 |
| sys:http 示范 | Task 5 |
| 测试策略 | Task 2–5 单测 + 等价测试 |
| 迁移指南 | Task 6 |
| Quicker.Host.Adapters | 推迟至 P6 plan |
| 142 keys 全覆盖 | 后续 Phase 索引 |

无 TBD / 占位符步骤。

---

**执行选项（P0 完成后）：**

1. **Subagent-Driven** — 每 Task 派生子 agent，逐 Task 审查
2. **Inline Execution** — 本会话按 Task 顺序实现，检查点汇报

请选择执行方式，或先审查 spec/plan 再开始实现。
