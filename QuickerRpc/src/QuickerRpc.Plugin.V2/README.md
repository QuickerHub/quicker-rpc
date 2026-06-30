# QuickerRpc.Plugin.V2

net10 in-process RPC plugin for **Quicker V2**. Resolves Quicker services via reflection (`Launcher.GetService`) and wires `QuickerRpc.Runtime` + `QuickerRpc.Transport`.

## Host resolution

| Priority | Source |
|----------|--------|
| 1 | External `IQuickerRpcHost` from Quicker DI (future Infrastructure) |
| 2 | **Default:** reflection adapters in this project (`V2QuickerRpcHost`) |

V2 service locator: `Quicker.Domain.Services.Launcher.GetService` (fallback: legacy `AppState.GetService`).

## Implemented ports (reflection)

| Port | V2 API |
|------|--------|
| `Session` | `IUserInfoService` |
| `ActionPrograms` | `ActionRuntimeLookupService` + `ActionItem2Store` + `ActionItem2Extensions` |
| `SubPrograms` | `GlobalSubProgramDataService` |
| `StepRunners` | `IStepRunnerService.GetAllRunners` (full inputParams mapping) |
| `Search` | `GetAllActionsWithLocation` + `SnapshotAll` linear scan |

Headless editing workflow (`action get/patch`, `subprogram get/patch`, `step-runner get`, `action list`, `subprogram list`) is supported via reflection. Other ports return structured "not implemented yet" errors.

## Layout

| Path | Role |
|------|------|
| `Reflection/QuickerV2Runtime.cs` | `Launcher` / `AppState` service locator |
| `Reflection/QuickerV2*Accessor.cs` | Action / subprogram / step-runner probes |
| `Services/V2Headless*.cs` | Headless read/write orchestration |
| `Adapters/V2QuickerRpcHost.cs` | `IQuickerRpcHost` aggregation |
| `Launcher.cs` | `QuickerRpc.Plugin.Launcher` — same entry as V1 (`Start(_context)`) |
| `Runner.cs` | Optional alias → `Launcher.Start` |

## vs Plugin.V1

| | V1 (`QuickerRpc.Plugin.V1`) | V2 (this project) |
|--|----------------------------|-------------------|
| TFM | net472 | net10.0 |
| **Public entry** | `QuickerRpc.Plugin.Launcher` | **`QuickerRpc.Plugin.Launcher`** (same) |
| **QuickerRpc_Run** | `load` + `type Launcher, QuickerRpc.Plugin.{version}` | **same** (package `quicker.rpc.net10` on V2) |
| Host | V1 adapters + compile-time Quicker refs | Reflection on V2 services |
| UI | WPF scheduler, Designer ports | No Designer; inline scheduler |
| Ship | `quicker.rpc` getquicker package | `quicker.rpc.net10` getquicker package (`build.net10.yaml` + `.\build.ps1 -Net10 -Publish`) |

Offline API probes: `tests/QuickerRpc.Runtime.Test/QuickerV2HostProbeTests.cs` (metadata scan of `tools/quicker-host/net10`).
