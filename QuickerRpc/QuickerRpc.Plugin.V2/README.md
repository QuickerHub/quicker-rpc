# QuickerRpc.Plugin.V2

net10 in-process RPC plugin for **Quicker V2**. Thin shell: resolves `IQuickerRpcHost` from AppState DI, wires `QuickerRpc.Runtime` + `QuickerRpc.Transport`.

## Prerequisites (Quicker main repo — P4.1)

```csharp
// Quicker.Infrastructure — not in this repo yet
services.AddQuickerRpcHostV2();
```

Until P4.1 lands, `Launcher.Start()` throws if `AppState.GetService<IQuickerRpcHost>()` is missing.

## Layout

| Path | Role |
|------|------|
| `Host/QuickerAppStateHostResolver.cs` | Reflection → `AppState.GetService<IQuickerRpcHost>()` |
| `Composition/PluginV2ServiceCollectionExtensions.cs` | DI: Runtime + Transport |
| `Launcher.cs` | Start/stop pipe server |
| `Runner.cs` | Static entry (`StartRpcServer`) |

## vs Plugin.V1

| | V1 (`QuickerRpc.Plugin.V1`) | V2 (this project) |
|--|----------------------------|-------------------|
| TFM | net472 | net10.0 |
| Host | V1 adapters + Headless* + reflection | `IQuickerRpcHost` from Infrastructure |
| UI | WPF scheduler, Designer ports | No Designer; inline scheduler |
| Ship | `quicker.rpc` getquicker package | Bundled with Quicker V2 |

Architecture: [docs/design/quicker-rpc-plugin-v2.md](../../docs/design/quicker-rpc-plugin-v2.md)
