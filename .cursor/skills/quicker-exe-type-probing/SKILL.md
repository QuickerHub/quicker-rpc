---
name: quicker-exe-type-probing
description: >-
  Guides agents to find Quicker.exe internal types and methods for quicker-rpc plugin work.
  Use when implementing or debugging reflection against Quicker.exe, locating internal Quicker
  APIs, handling obfuscated Release builds, qkref references, or service access from
  QuickerRpc.Plugin.
---

# Quicker.exe Type Probing

## When To Use

Use this skill before changing `QuickerRpc.Plugin` code that reflects into Quicker internals: action editing, program persistence, variable editing, designer APIs, step-runner catalog, or service access from the injected plugin.

## Where To Find Code

Read this section **before** guessing type names or adding reflection.

**Prefer local source over exe scans.** When `.ref/Quicker/QuickerPc` is present (see repo `.ref/`), read and `rg` there first. Use `QuickerRpc.Plugin.Test` Release/Debug scans only to confirm obfuscated runtime signatures or when `.ref` is missing/out of date.

### A. quicker-rpc — code you edit

| Area | Path | Notes |
|------|------|--------|
| Reflection helpers | `QuickerRpc.Plugin/Reflection/` | `QuickerInternalAccess`, `QuickerAssemblyReflection`, `QuickerActionEditReflection` |
| RPC-facing services | `QuickerRpc.Plugin/Services/` | One file per capability (`ActionEditService`, `ActionProgramPersistence`, …) |
| RPC surface | `QuickerRpc.Plugin/Rpc/QuickerRpcService.cs` | Maps CLI/RPC to services |
| Contracts | `QuickerRpc.Contracts/Rpc/IQuickerRpcService.cs` | Public RPC API |
| XAction compress/patch (no Quicker.exe) | `QuickerRpc.AgentModel/` | Agent models; **not** runtime reflection |
| Action authoring docs for agents | `QuickerRpc.AgentModel/Docs/ActionAuthoring/` | CLI workflow, step modules, expressions |
| Offline exe scans | `QuickerRpc.Plugin.Test/` | Debug/Release `Quicker.exe` signature probes |
| Quicker DLL references | `qkref.props` | Default Release: `C:/Program Files/Quicker` |

**First step:** search `QuickerRpc.Plugin` for an existing wrapper (`rg ActionEditMgr QuickerRpc.Plugin`).

### B. Quicker product source — implementation reference (primary)

Local tree (gitignored): **`.ref/Quicker/QuickerPc/`** — e.g. `D:\source\repos\quicker\quicker-rpc\.ref\Quicker\QuickerPc`. May be a full QuickerPc checkout, not only `dev` from [QuickerOrg/Quicker](https://github.com/QuickerOrg/Quicker). **Trust the tree you have** for save/designer APIs; do not assume `ActionItem2` exists because another branch did.

| What you need | Where to look |
|---------------|---------------|
| Domain services (`ActionEditMgr`, search, runtime lookup) | `.ref/Quicker/QuickerPc/Quicker/Domain/Services/` |
| App state, catalog, profiles | `.ref/Quicker/QuickerPc/Quicker/Domain/` |
| XAction program model (steps, variables, subprograms) | `.ref/Quicker/QuickerPc/Quicker/Actions/XActions/` |
| Designer UI (Ctrl+S, `SaveAllData`, `UpdateXActionUi`) | `.ref/Quicker/QuickerPc/Quicker/View/X/ActionDesignerWindow.xaml.cs` |
| Utilities / extensions used by reflection | `QuickerPc/Quicker/Utilities/` |
| Stable public API (`IQuickerApi`, expressions) | `QuickerPc/Quicker.Public/` |
| Shared DTOs, legacy models | `QuickerPc/Common/Quicker.Common/` (submodule) | `ActionItem2ProgramAccess` (some `Quicker.Common.V2.*` types may exist only in built DLLs — use Debug exe scan if source has no match) |

**Submodule:** shallow clone does **not** populate `QuickerPc/Common/`. Before searching Common types:

```powershell
git -C .ref/Quicker submodule update --init QuickerPc/Common
```

Refresh source:

```powershell
git -C .ref/Quicker pull origin dev
git -C .ref/Quicker submodule update --init QuickerPc/Common
```

**Search examples** (run from repo root):

```powershell
rg "class ActionEditMgr" .ref/Quicker/QuickerPc
rg "SaveEditingAction" .ref/Quicker/QuickerPc/Quicker
rg "IStepRunnerService" .ref/Quicker/QuickerPc
rg "ActionItem2" .ref/Quicker/QuickerPc/Common
```

Source is **reference only** — do not ship Quicker internal types into user actions unless exposed via `qkrpc step-runner get` (see `QuickerRpc.AgentModel/Docs/ActionAuthoring/implementation-fallback.md`).

### C. Runtime binaries — confirm signatures

| Build | Typical path | Override |
|-------|--------------|----------|
| **Release** (obfuscated names) | `C:/Program Files/Quicker/Quicker.exe` | `QUICKER_DLL_PATH` |
| **Debug** (readable names) | Build output under `.ref/Quicker/QuickerPc/Quicker/bin/x64/Debug/net472/` or a separate Quicker dev tree | `QUICKER_DEBUG_DLL_PATH` (directory containing `Quicker.exe`) |

Probe tests (no live Quicker required):

```powershell
dotnet test QuickerRpc.Plugin.Test --filter FullyQualifiedName~QuickerExeDebugScanTests
dotnet test QuickerRpc.Plugin.Test --filter FullyQualifiedName~QuickerExeReleaseScanTests
```

Live RPC (Quicker + plugin running): `QuickerRpc.Test/` — see `AGENTS.md`.

### D. Type → source quick map (common quicker-rpc targets)

| Reflection target | Quicker source (Debug names) | quicker-rpc wrapper |
|-------------------|------------------------------|---------------------|
| `Quicker.Domain.AppState` | `QuickerPc/Quicker/Domain/AppState.cs` | `QuickerInternalAccess`, `QuickerAssemblyReflection` |
| `Quicker.Domain.Services.ActionEditMgr` | `QuickerPc/Quicker/Domain/Services/ActionEditMgr.cs` | `QuickerInternalAccess`, `ActionEditMgrAccessor` |
| `Quicker.Domain.Actions.X.*` | `QuickerPc/Quicker/Actions/XActions/` | `XActionProgramBodyWriter`, `ActionProgramPersistence` |
| `ActionItem` + `Data` (JSON `XAction`) | `ActionDesignerWindow.SaveAllData`, `ActionEditMgr.SaveEditingAction(ActionItem)` | `ActionProgramPersistence` legacy path, `ActionDesignerUiSave` |
| `Quicker.Common.V2.ActionItem2`, `XActionDto` | Only if present in **your** `.ref` or runtime; else optional fallback | `ActionItem2ProgramAccess` |
| `Quicker.View.X.ActionDesignerWindow` | `ActionDesignerWindow.xaml.cs` (`Action`, `ResultActionItem`, `UpdateXActionUi`) | `ActionDesignerUiSave`, `DesignerVariableEditService` |
| Step runner catalog | search `IStepRunnerService` under `QuickerPc/` | `StepRunnerCatalogFromQuicker` |

## Core Rules

- The plugin runs inside `Quicker.exe`; resolve against **loaded** assemblies (`Assembly.GetEntryAssembly()`, `typeof(AppState).Assembly`), not assumed folder layout.
- **Debug source / Debug exe:** use type and method names to learn signatures.
- **Release runtime:** resolve by **signature and behavior**, not obfuscated type full names.
- If multiple runtime matches exist, treat the resolver as unavailable — do not guess.
- For generics, compare `GetGenericTypeDefinition().FullName` across assemblies.
- Keep wrappers narrow; surface clear errors to the CLI layer.

## Recommended Workflow

1. Find or add a wrapper in `QuickerRpc.Plugin/Services/` or `Reflection/`.
2. Search **`.ref/Quicker/QuickerPc`** (`rg` / read call sites) for type/method and save flow.
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
- [ ] Searched `.ref/Quicker` (and `QuickerPc/Common` if types live in Quicker.Common)
- [ ] Recorded Debug type/method **full signature**
- [ ] Avoided hardcoding obfuscated Release type names
- [ ] Runtime lookup requires **exactly one** match
- [ ] Failures return unavailable / clear RPC error, not null-reference crashes
- [ ] Ran `build.ps1 -t` after plugin/console/contracts changes

## Related

- Repo overview + CLI: `AGENTS.md`
- Build after edits: `.cursor/skills/quicker-rpc-build-test/SKILL.md`
- Agent XAction editing (no reflection): `QuickerRpc.AgentModel/Docs/ActionAuthoring/overview.md`
