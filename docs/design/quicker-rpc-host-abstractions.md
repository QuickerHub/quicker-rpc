# QuickerRpc Host Abstractions（V1/V2 分插件）

## 目标

- Quicker 进程内**只会是 V1 或 V2 一种运行时**，不在同一插件 DLL 里做双轨反射兼容。
- **契约**在 `QuickerRpc.Host.Abstractions`（netstandard2.0 / net472）。
- **实现**在 Quicker 主程序（V2：`Quicker.Infrastructure.QuickerRpc.Host`）或未来 net472 专用插件（V1）。
- **QuickerRpc.Plugin.V2**（net10）只依赖 Abstractions + Contracts，通过 `AppState.GetService<IQuickerRpcHost>()` 调用宿主。

## 项目

| 项目 | 职责 |
|------|------|
| `QuickerRpc.Host.Abstractions` | `IQuickerRpcHost`、`IQuickerRpcActionProgramHost`、`IQuickerRpcActionSharingHost` + DTO |
| `Quicker.Infrastructure.QuickerRpc.Host` | V2 实现（ActionItem2 权威存储） |
| `QuickerRpc.Plugin.V2`（待拆） | RPC 编排，调用 `IQuickerRpcHost` |

## 接口一览

### `IQuickerRpcHost`

- `Info`：`QuickerHostKind`、`QuickerVersion`
- `ActionPrograms`：无头 XAction 读写
- `ActionSharing`：更新已分享动作

### `IQuickerRpcActionProgramHost`

- `TryGetProgramAsync` → `QuickerRpcActionProgramSnapshot`（`BodyJson` + `EditVersion` + presentation）
- `TryWriteProgramBodyAsync` → 合并 body JSON，**默认 bump `Metadata.LastEditTimeUtc`**
- `TryUpdatePresentationAsync` → 标题/描述/图标/右键菜单

写入选项 `QuickerRpcActionProgramWriteOptions`：

- `ExpectedEditVersion` / `Force`：乐观锁
- `TouchLastEditUtc`：默认 `true`

### `IQuickerRpcActionSharingHost`

- `UpdateSharedActionAsync` → 委托 `ActionEditMgr.UpdateSharedActionAsync`

## V2 实现要点（Quicker 主仓）

- 读：`ActionRuntimeLookupService` + `ActionItem2.GetXActionPayloadJson()`
- 写：`ActionStorageService.SetButtonAction`（无 UI），并 `ActionItem2Store.AddOrUpdateAction`
- 禁止在 UI 编辑器打开时保存：`ActionEditingStateService.IsActionEditing`

注册：`ServiceCollectionExtensions.AddQuickerServices` → `AddQuickerRpcHostV2()`。

## 插件侧解析（Plugin.V2）

```csharp
var host = AppState.GetService<IQuickerRpcHost>();
if (host is null || host.Info.Kind != QuickerHostKind.V2)
    throw new InvalidOperationException("QuickerRpc V2 host not registered.");

var snapshot = await host.ActionPrograms.TryGetProgramAsync(actionId, ct);
```

## 后续

- [ ] 拆 `QuickerRpc.Plugin` → `Plugin.V1` (net472) / `Plugin.V2` (net10)
- [ ] `HeadlessActionProgramService` 改为只调 `IQuickerRpcActionProgramHost`
- [ ] V1 包实现同名接口（`ActionItem` + legacy `SaveEditingAction`）
- [ ] `IQuickerRpcSubProgramHost`、`IQuickerRpcRunHost` 等按模块扩展
