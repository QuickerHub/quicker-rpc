---
name: quicker-exe-type-probing
description: >-
  Guides agents to find Quicker.exe internal types and methods for quicker-rpc plugin work.
  Use when implementing or debugging reflection against Quicker.exe, locating internal Quicker
  APIs, handling obfuscated Release builds, qkref references, or service access from
  QuickerRpc.Plugin.
metadata:
  internal: true
---

# Quicker.exe Type Probing

## When To Use

Use this skill before changing `QuickerRpc.Plugin` code that reflects into Quicker internals: action editing, program persistence, variable editing, designer APIs, step-runner catalog, or service access from the injected plugin.

## Where To Find Code

Read this section **before** guessing type names or adding reflection.

**Default order:** existing `QuickerRpc.Plugin` wrappers → `QuickerRpc.Plugin.Test` exe scans → installed `Quicker.exe` (Release, obfuscated). Optional maintainer-local source under `.ref/Quicker/` (gitignored) only when that directory already exists on disk.

### A. quicker-rpc — code you edit

| Area | Path | Notes |
|------|------|--------|
| Reflection helpers | `QuickerRpc.Plugin/Reflection/` | `QuickerInternalAccess`, `QuickerAssemblyReflection`, `QuickerActionEditReflection` |
| RPC-facing services | `QuickerRpc.Plugin/Services/` | One file per capability (`ActionEditService`, `ActionProgramPersistence`, …) |
| RPC surface | `QuickerRpc.Plugin/Rpc/QuickerRpcService.cs` | Maps CLI/RPC to services |
| Contracts | `QuickerRpc.Contracts/Rpc/IQuickerRpcService.cs` | Public RPC API |
| XAction compress/patch (no Quicker.exe) | `QuickerRpc.AgentModel/` | Agent models; **not** runtime reflection |
| Action authoring docs for agents | `docs/action-authoring-src/` + `manifest/*.json` | Generate → `cli/` (qkrpc) / single skill `docs/skills/quicker-authoring/` (QuickerAgent) |
| Offline exe scans | `QuickerRpc.Plugin.Test/` | Debug/Release `Quicker.exe` signature probes |
| Quicker DLL references | `qkref.props` | Default Release: `C:/Program Files/Quicker` |

**First step:** search `QuickerRpc.Plugin` for an existing wrapper (`rg ActionEditMgr QuickerRpc.Plugin`).

### B. Optional local Quicker source (maintainer only)

`.ref/Quicker/` is **gitignored** and not part of this repository. Clone/setup is out of scope for agents; do not document or assume a public upstream.

When the directory exists, use it for **Debug type/method names** and call-site context. **Trust the tree you have** — save/designer APIs differ by version/branch; do not assume types like `ActionItem2` exist because another environment had them.

| What you need | Search under `.ref/Quicker/` (examples) |
|---------------|----------------------------------------|
| Domain services (`ActionEditMgr`, search, runtime lookup) | `rg "class ActionEditMgr"` |
| XAction program model (steps, variables, subprograms) | `rg "SaveEditingAction"` / `XAction` under Actions |
| Designer UI (`SaveAllData`, `UpdateXActionUi`) | `rg "ActionDesignerWindow"` |
| Step runner catalog | `rg "IStepRunnerService"` |
| Shared DTOs / legacy models | `rg` for the type name; Common layout varies |

```powershell
# From repo root — only if .ref/Quicker exists
rg "class ActionEditMgr" .ref/Quicker
rg "SaveEditingAction" .ref/Quicker
rg "IStepRunnerService" .ref/Quicker
```

Source is **reference only** — do not ship Quicker internal types into user actions unless exposed via `qkrpc step-runner get` (see `docs/action-authoring/implementation-fallback.md`).

### C. Runtime binaries — confirm signatures

| Build | Typical path | Override |
|-------|--------------|----------|
| **Release** (obfuscated names) | `C:/Program Files/Quicker/Quicker.exe` | `QUICKER_DLL_PATH` |
| **Debug** (readable names) | Local Debug build output directory containing `Quicker.exe` | `QUICKER_DEBUG_DLL_PATH` |

Probe tests (no live Quicker required):

```powershell
dotnet test QuickerRpc.Plugin.Test --filter FullyQualifiedName~QuickerExeDebugScanTests
dotnet test QuickerRpc.Plugin.Test --filter FullyQualifiedName~QuickerExeReleaseScanTests
```

Live RPC (Quicker + plugin running): `QuickerRpc.Test/` — see `AGENTS.md`.

### D. Type → quicker-rpc wrapper (common targets)

| Reflection target (Debug names) | quicker-rpc wrapper |
|---------------------------------|---------------------|
| `Quicker.Domain.AppState` | `QuickerInternalAccess`, `QuickerAssemblyReflection` |
| `Quicker.Domain.Services.ActionEditMgr` | `QuickerInternalAccess`, `ActionEditMgrAccessor` |
| `Quicker.Domain.Actions.X.*` | `XActionProgramBodyWriter`, `ActionProgramPersistence` |
| `ActionItem` + `Data` (JSON `XAction`) | `ActionDesignerProgramAccess`, `ActionProgramPersistence`, `ActionDesignerUiSave` |
| `Quicker.View.X.ActionDesignerWindow` | `ActionDesignerUiSave`, `DesignerVariableEditService` |
| Step runner catalog (`IStepRunnerService`) | `StepRunnerCatalogFromQuicker` |

Use `.ref/Quicker` (if present) or Debug `Quicker.exe` to locate declaring types and full signatures for new wrappers.

## Core Rules

- The plugin runs inside `Quicker.exe`; resolve against **loaded** assemblies (`Assembly.GetEntryAssembly()`, `typeof(AppState).Assembly`), not assumed folder layout.
- **Debug source / Debug exe:** use type and method names to learn signatures.
- **Release runtime:** resolve by **signature and behavior**, not obfuscated type full names.
- If multiple runtime matches exist, treat the resolver as unavailable — do not guess.
- For generics, compare `GetGenericTypeDefinition().FullName` across assemblies.
- Keep wrappers narrow; surface clear errors to the CLI layer.

## Recommended Workflow

1. Find or add a wrapper in `QuickerRpc.Plugin/Services/` or `Reflection/`.
2. If `.ref/Quicker` exists, `rg` / read call sites for type/method and save flow; otherwise use Plugin.Test scans and Debug exe.
3. Record full signature: declaring type, static/instance, parameters, return type, async shape.
4. Only if needed: validate **Release** obfuscation via `QuickerRpc.Plugin.Test` scans.
5. Implement runtime lookup by signature in `QuickerRpc.Plugin`; avoid hardcoding Release type names.
6. Run `pwsh ./build.ps1 -t` (see `quicker-rpc-build-test` skill).

## Probe Patterns

Debug discovery (names OK):

```csharp
var assembly = Assembly.LoadFrom(debugQuickerExePath);
var type = assembly.GetType("Quicker.Domain.Services.ActionEditMgr");
var method = type?.GetMethod("SaveEditingAction", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
```

Release runtime (signature only):

```csharp
var candidates = assembly.GetTypes()
    .SelectMany(t => t.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance))
    .Where(m => /* match return type, parameter types/count, static/instance — not Release type name */)
    .ToArray();

if (candidates.Length != 1)
{
    return unavailable;
}
```

Prefer a focused helper on the service that needs it; share only when several services use the same lookup rule.

## Agent Checklist

- [ ] Checked existing `QuickerRpc.Plugin` wrappers before adding reflection
- [ ] Used `.ref/Quicker` only if present; otherwise Plugin.Test + installed exe
- [ ] Recorded Debug type/method **full signature**
- [ ] Avoided hardcoding obfuscated Release type names
- [ ] Runtime lookup requires **exactly one** match
- [ ] Failures return unavailable / clear RPC error, not null-reference crashes
- [ ] Ran `build.ps1 -t` after plugin/console/contracts changes

## Related

- Repo overview + CLI: `AGENTS.md`
- Build after edits: `.cursor/skills/quicker-rpc-build-test/SKILL.md`
- Agent XAction editing (no reflection): `docs/action-authoring/overview.md`
