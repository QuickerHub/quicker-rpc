# ActionRuntime V2 执行模式迁移设计

> 日期：2026-06-11  
> 状态：P6 切主基础设施已接入 QuickerPc net10（2026-06-11）；`XActionRunner` 灰度入口 + OperationsBundle；`ActionExecutionService` 级切主待办  
> 决策：**方案 1 — Quicker.exe 最终采用 ActionRuntime 作为唯一执行引擎（用户确认 A）**

---

## 1. 背景与问题

### 1.1 当前状态

| 侧 | 执行模型 | 步骤数 | 业务逻辑位置 |
|----|----------|--------|--------------|
| **QuickerPc** | `BaseAttributeStepRunner` → 生成 `Params` → `ExecuteInternal(p)` | ~142 个 `*StepV2` | 多在 `*.Execute.cs` 内联（如 `HttpStepV2` 600+ 行） |
| **quicker-rpc ActionRuntime** | `IStepModule` → 手写 `StepParamReader` → `*Operations` 静态类 | ~70 个已注册 | 部分已抽到 `I*Operations`（~60 接口） |

两套实现并行维护，行为对齐成本高；Quicker 主工程 `XActionRunner` 与 ActionRuntime 引擎未统一。

### 1.2 目标

1. **执行模式对齐 StepRunner V2**：强类型 `Params` 绑定 + `ExecuteInternal`，替代 `StepParamReader` 手写解析。
2. **业务逻辑下沉到 Operations API**：步骤壳只负责参数映射；复杂逻辑在 `I*Operations` 实现类。
3. **Quicker 只做 Host 实现**：桌面/WPF/Win32 能力通过 `Quicker.Host.Adapters` 注入；ActionRuntime 对简单模块提供可测试的真实现，复杂模块提供 Mock/ExplicitUnsupported。
4. **覆盖全部 Quicker 已实现步骤**：按模块 Pack 分批迁移，最终 `XActionRunner` 主循环由 `IActionRuntime.Execute` 取代。

### 1.3 非目标

- 跨进程 IPC / Named Pipe 执行协议（沿用同进程 `IActionRuntime.Execute`）
- 修改 StepEngine 设计器 metadata 生成器（`[Step]` / `Definition.cs` 保留在 Quicker）
- Phase 0 一次性迁移全部 142 步骤
- ActionRuntime 内复刻 Quicker 账号、动作库、Sync 能力

---

## 2. 架构决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 集成形态 | **A：引擎替换** | 用户确认；避免双轨长期维护 |
| 步骤执行壳 | `RuntimeAttributeStepModule<TParams>` | 对齐 V2，绑定 `IRuntimeContext` 而非 `IActionExecuteContext` |
| 业务边界 | `I*Operations` + DTO | 已有 ~60 接口；便于 Mock 与 Quicker 注入 |
| 源码归属 | **QuickerPc monorepo 为 canonical** | 与 Quicker 集成本地；quicker-rpc 同步引用同版本 |
| 未实现步骤 | 明确失败 | `StepResult.Failed` / `UnsupportedStep`，不静默跳过 |
| 灰度策略 | 按 `StepRunnerKey` 回落 | 命中 Registry → ActionRuntime；否则暂留 `XActionRunner`（迁移期） |

---

## 3. 分层结构

```text
┌─────────────────────────────────────────────────────────────┐
│ Quicker.exe                                                  │
│  ActionExecutionService                                      │
│    BuildPackage → RuntimeServices.Push(QuickerOps)          │
│    IActionRuntime.Execute(package) → ApplyResult              │
│  Quicker.Host.Adapters                                       │
│    Quicker*Operations, QuickerHostServices, ContextBridge    │
└────────────────────────────┬────────────────────────────────┘
                             │ 同进程引用
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ Quicker.ActionRuntime.Abstractions                           │
│  IActionRuntime, IRuntimeContext, ActionExecutionPackage       │
│  I*Operations + Request/Result DTOs                          │
└────────────────────────────┬────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ Quicker.ActionRuntime.Core                                   │
│  ExecutionEngine, RuntimeContext, ModuleRegistry             │
│  RuntimeAttributeStepModule + 各 Pack 步骤模块               │
│  Default*Operations（简单步骤真实现）                         │
└────────────────────────────┬────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ Quicker.ActionRuntime.Testing                                │
│  Deterministic*Operations, EquivalenceHarness                │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 依赖规则

| 项目 | 允许依赖 | 禁止依赖 |
|------|----------|----------|
| Abstractions | 无 Quicker 主工程 | WPF, AppState, AppHelper |
| Core | Abstractions | Quicker 主工程 |
| Testing | Abstractions, Core | Quicker 主工程 |
| Quicker.Host.Adapters | Abstractions, Core, Quicker 主工程 | — |

---

## 4. 步骤执行模式（V2 对齐）

### 4.1 RuntimeAttributeStepModule

ActionRuntime 版 `BaseAttributeStepRunner`，绑定 `IRuntimeContext`：

```csharp
public abstract class RuntimeAttributeStepModule<TParams> : IStepModule
    where TParams : RuntimeStepParams
{
    public abstract string StepRunnerKey { get; }

    public StepResult Execute(ActionStep step, IRuntimeContext context)
    {
        var p = RuntimeStepParamsFactory.Create<TParams>(step, context);
        bool stopIfFail = p.StopIfFail;

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
        if (!result.IsSuccess && stopIfFail)
        {
            context.Stop(ActionStopFlag.OperationFailed, result.Message ?? "步骤失败");
        }

        return result;
    }

    protected abstract StepResult ExecuteInternal(TParams p);
}
```

### 4.2 RuntimeStepParams

对标 `BaseStepParams`，核心差异：

| BaseStepParams (Quicker) | RuntimeStepParams (ActionRuntime) |
|--------------------------|-----------------------------------|
| `IActionExecuteContext Context` | `IRuntimeContext Context` |
| 生成器从 `ActionStep` + Context 延迟求值 | 同等延迟求值，实现可复用反射/metadata |
| `p.SetOutput(value)` 写变量 | 同语义，经 `IRuntimeContext.SetVar` |
| 可访问 `context.ShowWarning` | 经 `context.HostServices` |

**元数据来源**：步骤 `inputParams`/`outputParams` 键名与 V2 `Definition.cs` 中 `[InputParam(Key=...)]` 保持一致；开发期以 `qkrpc step-runner get` 为契约来源。

### 4.3 ExecuteInternal 约束

每个 `ExecuteInternal` **仅允许**：

1. 读取 `Params` 属性（已绑定/插值）
2. 调用 `IRuntimeContext` 流程 API（`RunChildSteps` 等，限 Flow 模块）
3. 调用 `I*Operations`（经 `context.Operations` 或 `RuntimeServices`）
4. 写输出（`p.SetOutput` / `p.SetIsSuccess`）

**禁止**：直接 `File.ReadAllText`、`HttpClient`、`P/Invoke`、WPF 调用。此类逻辑必须在 Operations 实现类。

### 4.4 示例：HTTP 步骤（目标态）

```csharp
public sealed class HttpStepModule : RuntimeAttributeStepModule<HttpStepModule.Params>
{
    public override string StepRunnerKey => "sys:http";

    protected override StepResult ExecuteInternal(Params p)
    {
        if (p.UseSse)
            return StepResult.Failed("SSE 需要 Quicker 宿主实现。");

        var http = p.Context.Operations.GetRequired<IHttpOperations>();
        var result = http.Execute(new HttpRequestOptions { Url = p.Url, /* ... */ });
        p.SetStatusCode(result.StatusCode);
        p.SetContent(result.Content);
        // ...
        return StepResult.Success;
    }
}
```

---

## 5. Operations API 规范

### 5.1 现有接口复用

`Quicker.ActionRuntime.Abstractions/Operations/` 下已有按领域划分的接口（Core / Network / Automation / Data / Media / Host）。迁移时**优先扩展现有接口**，避免平行命名。

### 5.2 实现归属矩阵

| 类别 | 示例接口 | ActionRuntime.Core | Quicker.Host.Adapters | Testing Mock |
|------|----------|-------------------|----------------------|--------------|
| 纯算法/文本 | `ITextOperations`, `IJsonOperations` | **真实现** | 委托 Core 或薄包装 | 可选确定性 |
| 文件 IO | `IFileOperations`, `IZipOperations` | **真实现**（路径展开） | 同左 | InMemory 后端 |
| 网络 | `IHttpOperations`, `IDownloadOperations` | HTTP 真实现；SSE 抛 Unsupported | 全量 + 进度 UI | Deterministic |
| 系统 | `ISysOperations`, `ITimeOperations` | **真实现** | 同左 | 固定种子 |
| 剪贴板/进程/窗口 | `IClipboardOperations`, `IWindowOperations` | Windows 可选真实现；否则 Mock | **真实现** | Recording mock |
| UI | `IUiOperations` | Noop/Mock | **WPF 真实现** | Recording |
| 自动化 | `IUiaOperations`, `IFlaUiOperations` | ExplicitUnsupported | **真实现** | Mock |
| 重型 | `IChromeControlOperations`, `IWebView2Operations`, Office | ExplicitUnsupported | **真实现** | Mock |

### 5.3 DI 与作用域

```text
每次 IActionRuntime.Execute(package):
  1. 创建 RuntimeContext（独立变量域）
  2. using RuntimeServices.Push(operationsBundle)  // 来自 package 或调用方 DI
  3. ExecutionEngine.RunChildSteps(...)
  4. Pop scope
```

- **Quicker 生产**：`QuickerOperationsBundle` 注册全部 `I*Operations` 真实实现 + `IHostServices`
- **ActionRuntime 测试**：`DeterministicOperationContainerFactory` 按 stepKey 配置 mock 默认值
- **CLI/Demo**：`DefaultOperationsBundle` = 简单真实现 + 复杂 stub

### 5.4 新增接口规则

当 V2 `Execute.cs` 无法映射到现有 `I*Operations` 时：

1. 在对应领域 `*Contracts.cs` 增加方法 + DTO
2. Core 提供 `Default*` 或 `Unsupported*` 实现
3. Quicker.Host 提供 `Quicker*` 实现
4. Testing 提供 `Deterministic*` 或 `Mock*`
5. 更新 `EquivalenceMockConfigurator` 默认值

---

## 6. Quicker 集成

### 6.1 目标调用链

```csharp
// ActionExecutionService（目标态）
var package = _packageBuilder.Build(xAction, executeContext);
var bundle = _serviceProvider.GetRequiredService<IQuickerOperationsBundle>();
using (RuntimeServices.Push(bundle.ToContainer()))
{
    var result = _actionRuntime.Execute(package);
    _resultApplier.Apply(executeContext, result);
}
```

### 6.2 ActionExecutionPackage 构建

`Build` 负责从 `IActionExecuteContext` 提取：

- `Program`（`XAction` 树，含 SubPrograms）
- `InputParam`、`InitialVars`
- `Options.IsDebugging`
- `HostServices`（桥接 `ShowWarning`、`UserInput` 等）

**不**在 Package 中携带 `AppState` / 账号 / 动作库句柄；步骤若需查库，经 `IQuickerInfoOperations` 等显式 API 注入。

### 6.3 迁移期双轨

```csharp
if (_routing.IsHandledByActionRuntime(step.StepRunnerKey))
    // 已在 ExecutionEngine 内
else
    _legacyRunner.ExecuteStep(step, context);  // 暂留 XActionRunner 路径
```

`ActionRuntimeRouting` 维护「已迁移 key 集合」，与 `ModuleRegistry.RegisteredKeys` 同源。每完成一个 Pack，从回落集合移除对应 keys。

### 6.4 Definition.cs 与 Execute.cs 归宿

| 文件 | 归属 | 说明 |
|------|------|------|
| `*StepV2.Definition.cs` | Quicker 主工程 | 设计器 metadata、`[Step]` 属性，不变 |
| `*StepV2.Execute.cs` | **迁入 ActionRuntime.Core**（或删除后由 Module 替代） | 逻辑改为调 `I*Operations` |
| Quicker 中 V2 Execute | 迁移完成后删除或保留空壳委托 | 最终 `StepRunnerService` 执行也走 `IActionRuntime` |

设计器仍通过 `MetadataStepRunnerService` 读取 Definition；运行时不再直接调用 Quicker 内 `ExecuteInternal`。

---

## 7. 模块 Pack 与迁移顺序

### P0 — 基础设施（1–2 周当量）

- `RuntimeAttributeStepModule` / `RuntimeStepParams` / `RuntimeStepParamsFactory`
- `IOperationsAccessor` on `IRuntimeContext`
- `IQuickerOperationsBundle` 契约
- 示范步骤：`sys:http` 端到端（V2 壳 + Operations + 等价测试）
- `Quicker.Host.Adapters` 项目骨架

### P1 — Flow + Expr（~18 keys）

`CommentStepV2`, `WaitTimeStepV2`, `StopActionStepV2`, `BreakStepV2`, `ContinueStepV2`, `IfStepRunnerV2`, `SimpleIfStepRunnerV2`, `EachStepV2`, `RepeatStepRunnerV2`, `GroupStepV2`, `SubProgramStepV2`, `AssignValueStepV2`, `ComputeStepV2`, `EvalExpressionStepV2`, `RunScriptStepV2`（若仅流程壳）等。

验证：子程序同栈、Break/Continue、表达式变量行为与 `XActionRunner` 一致。

### P2 — Core IO（~45 keys）

Text、File、Crypto、List、Dict、Compare、Path、Zip、Time、Sys、Network（HTTP/Download/SMTP/WebSocket 基础路径）。

从 Quicker `*.Execute.cs` 抽取到 `I*Operations`；ActionRuntime 提供可运行真实现。

### P3 — Host UI + Clipboard（~20 keys）✅

`NotifyStepV2`, `MessageBoxOutputStepV2`, `UserInputStepV2`, `SelectStepV2`, `ShowTextStepV2`, `ShowMenuStepV2`, `ShowWaitWinStepV2`, `OutputTextStepV2`, `ReportProgressStepV2`, 剪贴板系列, `OpenUrlStepV2` 等。

已迁移 Core 模块：`ClipboardStepModules`（2）、`TierCStepModules` 剪贴板扩展（4）、`HostUiStepModules`（9）、`UserInputStepModule`（1）；`StepImplementationTierCatalog` 已登记 17 keys。

Quicker 实现 `IUiOperations` 等；ActionRuntime 用 `RecordingHostServices` 测试。

### P4 — Automation + Process（~25 keys）✅

键鼠、窗口、进程、Explorer、IME、Shell、UIA/FlaUI 等。

已迁移 `AutomationStepModules.cs` 全部 31 个步骤壳至 `RuntimeOperationStepModule`；`StepImplementationTierCatalog` 已登记。

ActionRuntime：`Mock*` + `ExplicitUnsupported`；Quicker：全真实。

### P5 — Complex Packs（~33 keys）✅

Network Pack（12）、Media Pack（14）、Data Pack（5）、`sys:runScript` 已迁移至 V2 壳；全部 `IStepModule` 手写实现已清零（仅保留 `RuntimeAttributeStepModule` 基类）。

WebView2、Office COM 对象路径等仍由 Quicker Host 提供真实现；ActionRuntime 侧 Mock/Partial；`PackageSupportAnalyzer` 已标注 tier。

### P6 — 切主（quicker-rpc 准备 ✅ / QuickerPc 实施中）

- quicker-rpc：`ActionRuntimeRouting`（与 Registry 同源）、`docs/superpowers/plans/2026-06-11-actionruntime-p6-quicker-cutover.md`
- Quicker `ActionExecutionService` 默认 `IActionRuntime`
- 移除 `XActionRunner` 主循环（保留薄兼容层至下一版本）
- migratable keys 全注册；`DeliberatelyExcluded` 走 legacy

---

## 8. 测试策略

### 8.1 三层验证

| 层 | 工具 | 目的 |
|----|------|------|
| 单元 | `dotnet test` Registry/Params/Operations | 模块隔离 |
| 等价 | `ExecutionEquivalenceHarness` JSON/Jint/Roslyn | 编译器与 JSON 一致 |
| 交叉 | 新增 `V2ParityTests`：同 fixture 对比 Quicker V2 与 ActionRuntime | 迁移回归 |

### 8.2 Mock 策略

- 简单步骤：真实现交叉验证（Core vs Quicker 结果一致）
- 复杂步骤：Mock 验证 Params 绑定与输出映射；集成测仅在 Quicker 内跑
- 延续 `RuntimeServices.Push` + `DeterministicOperationContainerFactory`

### 8.3 支持度报告

`PackageSupportAnalyzer` 扩展：

- `Supported` / `Partial`（有警告降级）/ `MockOnly` / `Unsupported`
- 与 `MetadataStepRunnerService` 全量 key 列表 diff

---

## 9. 仓库同步

| 仓库 | 角色 |
|------|------|
| `quickerorg/Quicker/QuickerPc` | **Canonical**：Abstractions、Core、Testing、Host.Adapters |
| `quicker-rpc` | 消费方：quicker-rpc CLI、ScriptCompiler、Demo、等价测试；通过 submodule / 包引用同步 |

同步规则：

- 接口变更先在 QuickerPc 合入，再 bump quicker-rpc 引用
- quicker-rpc 独有：`ScriptCompiler`、`Integration` 层可保留在 quicker-rpc，依赖 Core

---

## 10. 错误处理

| 场景 | 行为 |
|------|------|
| 未知 `StepRunnerKey` | `OperationFailed` + 日志 |
| Operations 未注册 | `InvalidOperationException` → 步骤失败 |
| `ExplicitUnsupported` 调用 | 明确错误消息（含「需要 Quicker 宿主」） |
| 子程序未找到 | 失败，不回落 |
| 表达式异常 | 步骤失败，按 `stopIfFail` 停止动作 |

---

## 11. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 142 步骤迁移量大 | Pack 分批；每 Pack 可独立交付 |
| V2 Execute 与 Operations 语义漂移 | `V2ParityTests` + 等价 harness |
| `IActionExecuteContext` 隐式依赖 | 抽取清单；逐项改为显式 API |
| 双仓漂移 | QuickerPc canonical + CI 对比 RegisteredKeys |
| 表达式引擎差异 | 共用 Z.Expressions；对比 fixture |
| 迁移期双轨 bug | `ActionRuntimeRouting` 单源；集成测覆盖回落路径 |

---

## 12. 完成定义（项目级）

- [ ] `RuntimeAttributeStepModule` 替代全部 `StepParamReader` 手写模块
- [ ] `MetadataStepRunnerService` 中每个 key 在 Registry 中为 Supported / Partial / MockOnly / Unsupported 之一
- [ ] Quicker `ActionExecutionService` 默认走 `IActionRuntime.Execute`
- [ ] `XActionRunner.RunChildSteps` 主循环移除或委托给 `ExecutionEngine`
- [ ] 等价测试 + V2 parity 测试 CI 绿灯
- [ ] `docs/execution-equivalence-testing.md` 更新为 V2 迁移后流程

---

## 附录 A：Metadata 全量步骤清单（迁移 backlog）

以 `Quicker.StepRunners.V2.Metadata/MetadataStepRunnerService.Init()` 为准，共 **~130** 个注册项（含 Flow/Quicker/SoftwareControl）。按 Pack 归类供 Pack 负责人拆分任务，具体 `StepRunnerKey` 以 `qkrpc step-runner search` / Definition `[Step(Key=...)]` 为准。

**Flow**：Comment, WaitTime, If, SimpleIf, Each, Repeat, Group, Break, Continue, StopAction, SubProgram, AssignValue, Compute, EvalExpression

**Text/Data**：StringProcess, SplitString, JoinList, FormatString, StringReplace, RegexExtract, JsonExtract, PathExtraction, HtmlExtract, TextCounter, CharInfo, NumCompare, StrCompare, ListOperation, ManageList, DictOperation, TableOperation, DatabaseOperation

**File/Sys**：ReadFile, WriteTextFile, CheckFileExists, FileOperation, Zip, GenerateTempFile, RunOrOpen, GetFolderPath, GetSelectedFiles, StateStorage, DependencyCheck, Enc, NumberProcess, ComputeTime, ComputeColor, CreateGuid, Random, GetSysInfo, GetSystemInfo, GetQuickerInfo

**Network**：Http, HttpServer, Download, Smtp, WebSocket, Ocr, MathOcr, Translation, AiInvoke, CloudData, CloudObjectStore, TempCloudStore

**UI/Host**：Notify, MessageBoxOutput, UserInput, Select, SelectFile, SelectFolder, ShowText, ShowMenu, ShowWaitWin, OutputText, ReportProgress, Form, CustomWindow, CustomPanel, TextTools

**Clipboard/Media**：Get/Write Clipboard (text/image/files), WaitClipboardChange, Capture, CapturePro, PinImage, LongScreenshot, ImageProcess, GetImageInfo, ShowImage, TempImageBed, ReadQRcode, CreateQRCode, Draw, PlaySound, RecordSound

**Automation**：KeyInput, SendKeys, InputScript, MouseInput, KeyOperation, WaitKeyboard, UiAutomation, FlaUiAutomation, WindowOperation, ActivateProcessMainWindow, CheckProcessExists, GetWindowInfo, GetActiveProcessInfo, RestoreActiveWindow, SearchBmp, FileSystemWatch, ShellOperation, ImeControl, SendMessage, WinService, AudioControl

**Software/Heavy**：ChromeControl, WebView2, OfficeHelper, ExcelReadWrite, ExcelRangeOperation, ExcelObjectOperations, AutoCADControl, RhinoControl, AdobeSoftsControl, RunAction, GetActionInfo, QuickerOperation, RunCsScript, RunPythonScript, RunJsScript, PlayRecord, Record, EverythingSearch, GetChromeUrl, GetExplorerPath, SelectFileInExplorer, ToBase64String, WriteImageFile, WriteFileToClipboard, GetSelectedText, OpenUrl

---

**审查说明**：确认后进入 `writing-plans` 编写 Phase P0 实施计划。
