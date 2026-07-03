# Quicker V2 headless authoring — API probe map

Offline probes run against `tools/quicker-host/net10/` (or `QUICKER_V2_DLL_PATH` parent). Live validation requires Quicker V2 + `build.ps1 -t` plugin reload.

## Probe commands

```powershell
# Offline (no Quicker process)
dotnet test QuickerRpc/tests/QuickerRpc.Runtime.Test -c Release --filter FullyQualifiedName~QuickerV2HostProbeTests

# Live (Quicker V2 running)
qkrpc ping --json
qkrpc action apply --dir .quicker/actions/<guid> --force --json
qkrpc subprogram list --json
```

## V2 vs V1 model differences

| Area | V1 (`ActionItem`) | V2 (`ActionItem2`) |
|------|-------------------|---------------------|
| Program body | `Data` JSON string | `OperationPayload` : `IOperationPayload` |
| XAction programs | `Data` holds serialized XAction | `OperationType` = `xaction` + `OperationPayload` = `XActionDto` |
| Read helper | `ActionDesignerProgramAccess` | `ActionItem2Extensions.GetXActionPayloadJson` |
| Write (designer) | set `Data` | deserialize to `XActionDto`, set `OperationPayload` (see V1 `TryUpdateResultActionItem2`) |

**Root cause of `action apply` failure on V2:** writing a `string` into `OperationPayload`. Fix: `QuickerV2OperationPayloadWriter` → `XActionDto` + `OperationType`.

## Type map (net10 host)

| Purpose | Type | Assembly |
|---------|------|----------|
| Action lookup | `Quicker.Domain.Services.Actions.ActionRuntimeLookupService` | Quicker.dll |
| Action persist | `Quicker.Domain.Services.ActionItem2Store` | Quicker.dll |
| XAction extensions | `Quicker.Utilities.Extensions.ActionItem2Extensions` | Quicker.dll |
| Action model | `Quicker.Common.V2.ActionItem2` | Quicker.Common.dll |
| Payload contract | `Quicker.Common.V2.IOperationPayload` | Quicker.Common.dll |
| XAction DTO | `Quicker.Common.ActionPayloads.XAction.XActionDto` | Quicker.Common.dll |
| Operation type constants | `Quicker.Common.V2.OperationTypes` | Quicker.Common.dll |
| Global subprogram store | `Quicker.ReactiveData.IGlobalSubProgramDataService` | Quicker.dll |
| Subprogram model | `Quicker.Domain.Actions.X.SubProgram` | Quicker.StepEngine.dll |
| Step storage | `Quicker.Domain.Actions.X.Storage.ActionStep` | Quicker.StepEngine.dll |

## Plugin reflection entry points

| qkrpc capability | V2 wrapper | Probe when unavailable |
|------------------|------------|------------------------|
| `action get/apply` | `QuickerV2ActionAccessor` | `QuickerV2Runtime.DescribeActionServiceProbe()` |
| `subprogram get/apply` | `QuickerV2SubProgramAccessor` | `QuickerV2Runtime.DescribeSubProgramServiceProbe()` |
| Step-runner catalog | `QuickerV2StepRunnerCatalogBuilder` | `IStepRunnerService` in StepEngine.dll |

## Known gaps (2026-07-03)

1. **`action apply`** — fixed payload write path (`XActionDto`); retest on remote V2 after `build.ps1 -t`.
2. **`subprogram list/apply`** — `QuickerV2SubProgramAccessor` null when `IGlobalSubProgramDataService` not resolved from `Launcher.GetService`; probe via `DescribeSubProgramServiceProbe()` on live host.
3. **Cloud sync after headless save** — V2 `AddOrUpdate` / `AddOrUpdateAction` did not call `ISyncService.TriggerSync` (UI save paths do). Fixed via `QuickerV2CloudSyncTrigger.TryTriggerAfterPersist()` after persist (`0.14.8.130+`). `0.14.8.131+` adds `DescribeProbe()` (ISyncService resolve, trigger delegate, `GetPendingSyncItemCount`) and surfaces `cloudSync:` warnings on `subprogram apply` when pending=0 or trigger unavailable.
4. **Remote SSH apply** — same plugin code; use `Invoke-RemoteQkrpcAuthoring.ps1 action-apply` after hot-update. Deploy net10 with `Publish-RemotePackage.ps1 -SkipBuild` after `build.ps1 -Net10 -Test`.

## Re-probe checklist when Quicker V2 updates

1. Run `QuickerV2HostProbeTests` (type names in `Quicker.Common.dll` / `Quicker.dll`).
2. On live V2: log output of `DescribeActionServiceProbe()` and `DescribeSubProgramServiceProbe()`.
3. If `OperationPayload` property type changed, update `QuickerV2OperationPayloadWriter`.
4. If subprogram service moved, update `QuickerV2TypeNames` + `QuickerV2SubProgramAccessor.TryCreate`.
5. `build.ps1 -t` → remote `qkrpc action apply` smoke test.

See also: `.cursor/skills/quicker-exe-type-probing/SKILL.md` (V1 patterns), `QuickerRpc.Plugin.V2/Reflection/`.
