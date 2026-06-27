# QuickerRpc Core 架构设计

> 状态：已批准（2026-06-27）  
> 驱动：**B 优先**（repo 整理 + Plugin 模块化）；**A 写入计划**（V2 路径，后续 Phase）  
> 关联：[quicker-rpc-host-abstractions.md](./quicker-rpc-host-abstractions.md)

## 1. 目标

1. 在 `tools/qkrpc/QuickerRpc/` 下建立清晰的 **RPC 技术栈分层**，把传输、编排、宿主端口从 189 文件的 `QuickerRpc.Plugin` 单体中剥离。
2. **先设计并冻结统一宿主端口（Host Ports）**，V1 适配器与 V2 主仓实现共用同一套接口。
3. **不改变** `IQuickerRpcService` wire 面（CLI/MCP/agent-gui 无 breaking change）。
4. V2（`Plugin.V2` + `Quicker.Infrastructure.QuickerRpc.Host`）作为 **Phase 4+** 计划项，不在 Phase 0–2 阻塞 B。

## 2. 分层模型

```text
┌─────────────────────────────────────────────────────────────┐
│ Clients: QuickerRpc.Console (qkrpc) · agent-gui · MCP       │
└───────────────────────────┬─────────────────────────────────┘
                            │ IQuickerRpcService (wire)
┌───────────────────────────▼─────────────────────────────────┐
│ QuickerRpc.Transport — 命名管道 · StreamJsonRpc · Bootstrap │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│ QuickerRpc.Runtime — QuickerRpcService 薄编排（无 Quicker 反射）│
│   · 映射 wire 方法 → Host Ports + AgentModel + Features      │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
 QuickerRpc.Host.*    QuickerRpc.AgentModel   IQuickerRpcFeature*
 (端口契约)            (XAction 压缩/patch)     (可选扩展，见 §4)
        │
        ▼
 Plugin.V1 适配器 (net472)          Quicker.Infrastructure (V2, 主仓)
```

### 项目依赖（目标态）

| 项目 | TFM | 依赖 |
|------|-----|------|
| `QuickerRpc.Contracts` | netstandard2.0; net472 | 无 StreamJsonRpc |
| `QuickerRpc.Transport` | netstandard2.0; net472 | Contracts, StreamJsonRpc |
| `QuickerRpc.Host.Abstractions` | netstandard2.0; net472 | 无（DTO 自包含） |
| `QuickerRpc.AgentModel` | netstandard2.0; net472 | — |
| `QuickerRpc.Runtime` | netstandard2.0; net472 | Contracts, Host.Abstractions, AgentModel |
| `QuickerRpc.Plugin.V1` | net472 | Transport, Runtime, Host.Abstractions, AgentModel, Quicker refs |
| `QuickerRpc.Plugin.V2` | net10 | Transport, Runtime, Host.Abstractions（Phase 4+） |
| `QuickerRpc.Console` | net10 | Transport, Contracts, AgentModel |

## 3. 目录结构

```text
tools/qkrpc/
  QuickerRpc.slnx
  QuickerRpc/
    QuickerRpc.Contracts/
    QuickerRpc.Transport/          # 新建
    QuickerRpc.Runtime/            # 新建
    QuickerRpc.Host.Abstractions/  # 扩展统一端口
    QuickerRpc.AgentModel/
  QuickerRpc.Plugin.V1/          # net472 插件（V1 Host 适配器 + DI）
    QuickerRpc.Console/
  QuickerRpc.Host.Abstractions/  # 根目录（与 QuickerRpc/ 并列）
  QuickerRpc.Contracts/
  tests/
    QuickerRpc.Transport.Test/
    QuickerRpc.Runtime.Test/
    QuickerRpc.Test/
  agent-gui/                       # 不迁入 QuickerRpc/
```

## 4. 统一接口设计（核心）

### 4.1 设计原则

| 原则 | 说明 |
|------|------|
| **端口按领域拆分** | 每个 `IQuickerRpc*Host` 对应 Quicker 内聚能力域，不按 RPC 方法字母序拆 |
| **Try 语义** | 读写操作用 `Try*` + 结果 DTO（含 `Success` / `ErrorMessage` / `VersionConflict`），与现有 `QuickerRpcActionProgramWriteResult` 一致 |
| **Capabilities 显式** | 可选端口通过 `IQuickerRpcHostCapabilities` 声明；Runtime 对缺失端口返回 wire 层已有错误形状 |
| **V1/V2 同接口** | 同一端口在 V1（Plugin 反射）与 V2（Infrastructure）实现；**禁止**在 Runtime 写 `if (V1) … else …` |
| **UI 端口隔离** | ActionDesigner / 浮窗 / 打开编辑器 → `IQuickerRpcDesignerHost`，V2 可为 null |
| **AgentModel 边界** | 压缩/patch/schema 留在 AgentModel；Host 只处理 **权威存储** 的 body JSON 与 editVersion |

### 4.2 根聚合：`IQuickerRpcHost`

```csharp
namespace QuickerRpc.Host;

/// <summary>
/// Root host surface for one Quicker process (V1 or V2, never both).
/// Required ports are always non-null; optional ports may be null — check Capabilities first.
/// </summary>
public interface IQuickerRpcHost
{
    QuickerRpcHostInfo Info { get; }

    IQuickerRpcHostCapabilities Capabilities { get; }

    /// <summary>Process/session identity (account, web token).</summary>
    IQuickerRpcSessionHost Session { get; }

    /// <summary>Headless local XAction read/write (required).</summary>
    IQuickerRpcActionProgramHost ActionPrograms { get; }

    /// <summary>getquicker share/update (required for publish RPCs).</summary>
    IQuickerRpcActionSharingHost ActionSharing { get; }

    /// <summary>Global subprograms (required for subprogram headless RPCs).</summary>
    IQuickerRpcSubProgramHost SubPrograms { get; }

    /// <summary>Run/trace/float local actions (required for run RPCs).</summary>
    IQuickerRpcActionRunHost ActionRuns { get; }

    /// <summary>Local action catalog ops: create/delete/move/profile (required).</summary>
    IQuickerRpcActionCatalogHost ActionCatalog { get; }

    /// <summary>Search/index (required for search RPCs).</summary>
    IQuickerRpcSearchHost Search { get; }

    /// <summary>Quicker settings read/write (required).</summary>
    IQuickerRpcSettingsHost Settings { get; }

    /// <summary>Shared action HTML intro on getquicker (required for action-doc RPCs).</summary>
    IQuickerRpcActionDocHost ActionDocs { get; }

    /// <summary>StepRunner catalog from Quicker runtime (required).</summary>
    IQuickerRpcStepRunnerHost StepRunners { get; }

    /// <summary>Expression/script eval inside Quicker (required).</summary>
    IQuickerRpcExpressionHost Expressions { get; }

    /// <summary>Browser connector / sys:chromecontrol (optional).</summary>
    IQuickerRpcChromeControlHost? ChromeControl { get; }

    /// <summary>Triggers/tasks (optional).</summary>
    IQuickerRpcTriggerHost? Triggers { get; }

    /// <summary>Designer UI, clipboard STA, open-editor — V1 only (optional).</summary>
    IQuickerRpcDesignerHost? Designer { get; }

    /// <summary>Launcher intent resolution (optional).</summary>
    IQuickerRpcLauncherHost? Launcher { get; }
}
```

### 4.3 能力声明：`IQuickerRpcHostCapabilities`

```csharp
namespace QuickerRpc.Host;

public interface IQuickerRpcHostCapabilities
{
    bool ChromeControl { get; }
    bool Triggers { get; }
    bool DesignerUi { get; }
    bool Launcher { get; }

    /// <summary>True when headless patch must refuse if Action Designer has the action open.</summary>
    bool EnforcesDesignerOpenGuard { get; }
}
```

V1 典型值：`DesignerUi=true`, `EnforcesDesignerOpenGuard=true`  
V2 典型值：`DesignerUi=false`, `EnforcesDesignerOpenGuard=true`（由 Infrastructure 检查 `ActionEditingStateService`）

### 4.4 端口一览

#### 已有（保留，微调命名空间文档）

| 端口 | 文件 | Phase |
|------|------|-------|
| `IQuickerRpcActionProgramHost` | 已有 | P1 接入 Runtime |
| `IQuickerRpcActionSharingHost` | 已有 | P2 |
| `QuickerRpcActionProgramSnapshot` 等 DTO | 已有 | P1 |

#### 新增端口（Phase 0 仅 **接口 + DTO 骨架**，Phase 1+ 逐步实现）

**`IQuickerRpcSessionHost`**

```csharp
Task<QuickerRpcAccountInfo> GetAccountAsync(CancellationToken ct = default);
Task<QuickerRpcWebSessionInfo> GetWebSessionAsync(CancellationToken ct = default);
```

**`IQuickerRpcSubProgramHost`**

```csharp
Task<QuickerRpcSubProgramSnapshot?> TryGetAsync(string idOrName, CancellationToken ct = default);
Task<QuickerRpcSubProgramWriteResult> TryWriteBodyAsync(QuickerRpcSubProgramBodyWrite write, CancellationToken ct = default);
Task<QuickerRpcSubProgramWriteResult> TryCreateAsync(QuickerRpcSubProgramCreate create, CancellationToken ct = default);
Task<QuickerRpcHostMutationResult> TryDeleteAsync(string idOrName, bool skipConfirm, CancellationToken ct = default);
```

**`IQuickerRpcActionRunHost`**

```csharp
Task<QuickerRpcActionRunResult> RunAsync(QuickerRpcActionRunRequest request, CancellationToken ct = default);
Task<QuickerRpcActionTraceRunResult> RunTraceAsync(QuickerRpcActionTraceRunRequest request, IProgress<QuickerRpcActionTraceEvent>? progress, CancellationToken ct = default);
Task<QuickerRpcFloatActionResult> FloatAsync(string actionId, CancellationToken ct = default);
```

**`IQuickerRpcActionCatalogHost`**

```csharp
Task<QuickerRpcCreateActionResult> CreateActionAsync(QuickerRpcCreateActionRequest request, CancellationToken ct = default);
Task<QuickerRpcHostMutationResult> DeleteActionAsync(string actionId, bool showConfirm, CancellationToken ct = default);
Task<QuickerRpcMoveActionResult> MoveActionAsync(QuickerRpcMoveActionRequest request, CancellationToken ct = default);
Task<QuickerRpcCreateGlobalProfilesResult> CreateGlobalProfilesAsync(/* ... */);
Task<QuickerRpcDeleteProfileResult> DeleteEmptyProfilesAsync(/* ... */);
Task<QuickerRpcCreateVirtualProcessResult> EnsureVirtualProcessAsync(/* ... */);
```

**`IQuickerRpcSearchHost`**

```csharp
Task<QuickerRpcSearchActionSummariesResult> SearchActionSummariesAsync(/* ... */);
Task<QuickerRpcActionSearchResult> SearchActionsAsync(/* ... */);
Task<QuickerRpcSubProgramSearchResult> SearchGlobalSubProgramsAsync(/* ... */);
Task<QuickerRpcSearchActionLibraryResult> SearchActionLibraryAsync(/* ... */);
```

**`IQuickerRpcSettingsHost`**

```csharp
Task<QuickerRpcGetSettingResult> GetAsync(string key, CancellationToken ct = default);
Task<QuickerRpcSetSettingResult> SetAsync(string key, string value, CancellationToken ct = default);
Task<QuickerRpcApplySettingsResult> ApplyAsync(IReadOnlyDictionary<string, string> changes, CancellationToken ct = default);
Task<QuickerRpcSearchSettingsResult> SearchAsync(string? query, int maxResults, CancellationToken ct = default);
```

**`IQuickerRpcActionDocHost`**

```csharp
Task<QuickerRpcActionDocResult> GetDetailHtmlAsync(string idOrSharedId, CancellationToken ct = default);
Task<QuickerRpcActionDocResult> SetDetailHtmlAsync(string idOrSharedId, string html, CancellationToken ct = default);
Task<QuickerRpcActionDocResult> SubmitForReviewAsync(string idOrSharedId, string? html, CancellationToken ct = default);
```

**`IQuickerRpcStepRunnerHost`**

```csharp
Task<QuickerRpcSearchStepRunnersResult> SearchAsync(string keyword, int? maxResults, CancellationToken ct = default);
Task<QuickerRpcStepRunnerDetailResult> GetDetailAsync(string stepRunnerKey, string? controlField, bool includeUi, CancellationToken ct = default);
Task<QuickerRpcActionStepSummariesResult> SummarizeStepsAsync(/* ... */);
```

**`IQuickerRpcExpressionHost`**

```csharp
Task<QuickerRpcCodeSyntaxCheckResult> CheckExpressionAsync(/* ... */);
Task<QuickerRpcExpressionExecuteResult> ExecuteExpressionAsync(/* ... */);
Task<QuickerRpcCodeSyntaxCheckResult> CheckCSharpScriptAsync(/* ... */);
```

**`IQuickerRpcChromeControlHost`**（optional）

```csharp
Task<QuickerRpcChromeControlResult> ExecuteAsync(/* ... */);
Task<QuickerRpcChromeControlTabsResult> ListTabsAsync(CancellationToken ct = default);
```

**`IQuickerRpcTriggerHost`**（optional）

```csharp
Task<QuickerRpcTriggerTaskResult> RunTriggerTaskAsync(/* ... */);
```

**`IQuickerRpcDesignerHost`**（optional, V1）

```csharp
Task<QuickerRpcActionUpdateResult> OpenActionEditorAsync(string actionId, CancellationToken ct = default);
Task<QuickerRpcActionUpdateResult> OpenSubProgramEditorAsync(string idOrName, CancellationToken ct = default);
Task<QuickerRpcClipboardSpecialFormatReadResult> ReadClipboardFormatAsync(string format, CancellationToken ct = default);
Task<QuickerRpcClipboardSpecialFormatWriteResult> WriteClipboardFormatAsync(string format, string text, CancellationToken ct = default);
```

**`IQuickerRpcLauncherHost`**（optional）

```csharp
Task<QuickerRpcLauncherResolveResult> ResolveAsync(string query, CancellationToken ct = default);
```

> **DTO 复用规则**：wire 层已有的 `QuickerRpc*` result 类型留在 `QuickerRpc.Contracts`；Host 端口方法 **直接返回相同类型**，避免双份 DTO。新增 Host-only 请求类型放 `QuickerRpc.Host.Abstractions/Requests/`。

### 4.5 Runtime 编排：`QuickerRpcService`（迁到 `QuickerRpc.Runtime`）

```csharp
namespace QuickerRpc.Runtime;

public sealed class QuickerRpcService : IQuickerRpcService
{
    private readonly IQuickerRpcHost _host;
    private readonly QuickerRpcServiceDependencies _deps; // AgentModel helpers, catalogs

    public QuickerRpcService(IQuickerRpcHost host, QuickerRpcServiceDependencies deps) { ... }

    // Example mapping:
    public async Task<QuickerRpcGetCompressedActionResult> GetCompressedActionByIdAsync(
        string actionId, string? returnMode, CancellationToken ct)
    {
        var snapshot = await _host.ActionPrograms.TryGetProgramAsync(actionId, ct);
        if (snapshot is null)
            return FailGet($"Action not found: {actionId}");
        return _deps.Compress(snapshot, returnMode); // AgentModel
    }
}
```

**Dispatcher 辅助**（可选，Phase 1 后引入）：

```csharp
internal static class QuickerRpcHostGuard
{
    public static QuickerRpcChromeControlResult ChromeControlRequired(IQuickerRpcHost host)
        => host.ChromeControl is null
            ? QuickerRpcChromeControlResult.NotSupported(host.Info.Kind)
            : throw new InvalidOperationException("unreachable");
}
```

### 4.6 Wire → Port 映射表（节选，完整表在 Phase 1 checklist）

| `IQuickerRpcService` 方法组 | Host 端口 |
|------------------------------|-----------|
| `GetCompressedAction*`, `Apply*Patch*`, `ApplyXAction*`, `UpdateActionMetadata` | `ActionPrograms` + AgentModel |
| `Publish*`, `UpdateShared*`, `Preflight*` | `ActionSharing` |
| `Get/Apply/Patch/Create/DeleteGlobalSubProgram*` | `SubPrograms` + AgentModel |
| `RunAction*`, `RunXActionTrace*`, `FloatAction` | `ActionRuns` |
| `Create/Delete/MoveAction*`, `*Profile*`, `EnsureVirtualProcess` | `ActionCatalog` |
| `SearchAction*`, `ListGlobalSubProgram*`, `SearchActionLibrary` | `Search` |
| `Get/Set/ApplySettings*`, `SearchSettings` | `Settings` |
| `Get/Set/SubmitSharedActionDetail*` | `ActionDocs` |
| `Search/List/GetStepRunner*`, `GetActionStepSummaries` | `StepRunners` |
| `Check/ExecuteExpression*`, `CheckCSharpScript*` | `Expressions` |
| `ExecuteChromeControl*`, `ListBrowserTabs` | `ChromeControl` |
| `EditAction*`, `EditGlobalSubProgram*`, clipboard | `Designer` |
| `Ping`, `GetProtocolVersion` | Runtime 本地，不经过 Host |

## 5. Transport 层（`QuickerRpc.Transport`）

从 `QuickerRpc.Contracts` 与旧 `QuickerRpc.Plugin/Rpc/` 迁入（**已完成**，2026-06-27）：

| 类型 | 来源 |
|------|------|
| `QuickerRpcClient`, `QuickerRpcClientSession` | Contracts |
| `StreamJsonRpcFactory`, `StreamJsonRpcSession` | Contracts |
| `QuickerRpcBootstrap`, `QuickerRpcBootstrapPolicy` | Contracts |
| `QuickerRpcPipeNames` | Contracts |
| `QuickerRpcServerHost`（重命名自 `QuickerRpcServer`） | Plugin |
| `QuickerRpcPipeSecurity` | Plugin |

**Contracts 收敛后**仅保留：DTO、`IQuickerRpcService`、`IQuickerRpcClientCallbacks`、协议常量。

## 6. V1 适配器（`QuickerRpc.Plugin.V1`）

```
QuickerRpc.Plugin.V1/
  Adapters/
    V1QuickerRpcHost.cs              # implements IQuickerRpcHost
    V1ActionProgramHost.cs           # wraps LegacyActionProgramAccessor + Headless*
    V1SubProgramHost.cs
    ...
  Composition/
    PluginV1ServiceCollectionExtensions.cs
  Designer/                          # 从现有 Plugin 迁入 UI 注入
  Launcher.cs                        # 入口不变
  Rpc/
    PluginV1RpcHostBuilder.cs        # Transport.ServerHost + DI + Runtime
```

`V1QuickerRpcHost` 在 Phase 1 可先 **delegate 到现有 Service 类**，Phase 2 再内联到 Adapter。

## 7. V2 路径（Phase 4+，写入计划不阻塞 B）

| 步骤 | 位置 | 说明 |
|------|------|------|
| 7.1 | Quicker 主仓 | `Quicker.Infrastructure.QuickerRpc.Host` 实现 `IQuickerRpcHost` |
| 7.2 | qkrpc | 新建 `QuickerRpc.Plugin.V2` (net10)，`AppState.GetService<IQuickerRpcHost>()` |
| 7.3 | qkrpc | `HeadlessActionProgramService` 删除，逻辑仅在 Infrastructure + Runtime |
| 7.4 | 发布 | V2 插件随 Quicker 发行；V1 `quicker.rpc` 包继续维护至 V2 覆盖 |

## 8. 迁移阶段

| Phase | 目标 | 验收 |
|-------|------|------|
| **P0** | `QuickerRpc/` 目录 + **统一端口接口骨架** + `QuickerRpc.Transport` 项目 | 新测试绿；现有测试仍绿 |
| **P1** | `QuickerRpc.Runtime` + `ActionPrograms` 经 Host 端口；Console 改引 Transport | `build.ps1 -t` + `qkrpc ping` |
| **P2** | `Plugin.V1` 壳 + 其余 Host 端口适配（delegate 模式） | `QuickerRpc.Test` 集成通过 |
| **P3** | Plugin 单体删除；Designer 代码仅在 V1 | 189 文件 → V1 子目录可导航 |
| **P4+** | V2 Infrastructure + Plugin.V2 | 见 §7 |

## 9. 构建与发布

- `build.yaml` 的 `projectDir` 最终指向 `QuickerRpc.Plugin.V1`
- Costura 嵌入：Transport + Runtime + AgentModel + Contracts（与现策略一致）
- `dev.ps1` watch 增加 `QuickerRpc/**`
- **不**改变 `IQuickerRpcService` 方法签名（protocol version 仍为 1，直至显式 bump）

## 10. 测试

| 项目 | 范围 |
|------|------|
| `QuickerRpc.Transport.Test` | Client connect mock、Bootstrap、PipeSecurity |
| `QuickerRpc.Runtime.Test` | Service 映射 + Host mock |
| `QuickerRpc.Test` | 活进程集成（现有） |

## 11. 明确不做

- 不移动 `agent-gui/`
- Phase 0–2 不建 `Plugin.V2`
- 不合并 AgentModel 进 Runtime
- 不在 Runtime 写 V1/V2 分支
