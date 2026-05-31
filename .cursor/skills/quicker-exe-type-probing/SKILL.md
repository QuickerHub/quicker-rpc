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

Use this skill before changing `QuickerRpc.Plugin` code that reflects into Quicker internals, such as action editing, shared action update, variable editing, designer APIs, or service access from the injected plugin.

## Core Rules

- The plugin is loaded inside `Quicker.exe`; prefer probing the entry assembly (`Assembly.GetEntryAssembly()`) or the exact loaded Quicker assemblies rather than assuming source-tree assembly layout.
- Debug builds are usually unobfuscated: use type names and method names there to discover signatures.
- Installed Release builds may be obfuscated: runtime plugin code should resolve by stable signatures and behavior, not by internal type full names that can change.
- If multiple runtime matches are found, treat the resolver as unavailable instead of guessing.
- For generic types, compare `GetGenericTypeDefinition().FullName` when signatures cross assembly boundaries; do not rely on reference equality with types from a different build.
- Keep reflection wrappers narrow and report clear unavailable/error results to the CLI layer.

## Recommended Workflow

1. Check whether an existing wrapper already covers the API in `QuickerRpc.Plugin/Services/`.
2. Search the Quicker source tree for the expected Debug type or method name under `D:/source/repos/quicker/quickerorg/Quicker`.
3. Confirm the Debug signature from source or a Debug build: declaring type, method name, static/instance, parameters, return type, and async shape.
4. Validate the installed Release `Quicker.exe` shape by scanning loaded assemblies or by a small temporary probe/test before hardening the plugin resolver.
5. Implement runtime lookup by signature in `QuickerRpc.Plugin`, avoiding direct dependence on obfuscated Release type names.
6. After source changes, use the quicker-rpc build/test skill and run `pwsh ./build.ps1 -t` from the repo root.

## Source Skills Extracted From Quicker

The source Quicker repos contain detailed patterns that apply here:

- `designer-plugin-quicker-reflection`: Debug scans use names, Release scans use signatures, runtime plugin code resolves only by signature.
- `designer-quicker-plugin-architecture`: injected plugins run in the Quicker process and should align `qkref.props` references with the installed Quicker version.
- `stream-jsonrpc`: all RPC peers on one pipe should use aligned `StreamJsonRpc` versions.

## Probe Patterns

Debug discovery can use exact names:

```csharp
var assembly = Assembly.LoadFrom(debugQuickerExePath);
var type = assembly.GetType("Quicker.Domain.Services.SomeService");
var method = type?.GetMethod("SomeMethod", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static);
```

Release runtime lookup should filter by stable signature:

```csharp
var candidates = assembly.GetTypes()
    .SelectMany(t => t.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static))
    .Where(m => m.ReturnType.FullName == "System.Threading.Tasks.Task`1")
    .Where(m => m.GetParameters().Length == expectedParameterCount)
    .ToArray();

if (candidates.Length != 1)
{
    return unavailable;
}
```

Prefer adding a focused helper method near the service that needs it, unless several services share the same lookup rule.

## Paths To Check

- Current plugin reflection code: `QuickerRpc.Plugin/Services/`
- RPC implementation: `QuickerRpc.Plugin/Rpc/QuickerRpcService.cs`
- Contract surface: `QuickerRpc.Contracts/Rpc/IQuickerRpcService.cs`
- Quicker source tree: `D:/source/repos/quicker/quickerorg/Quicker`
- Installed Quicker binaries: `C:/Program Files/Quicker`
- Debug Quicker binaries: `QUICKER_DEBUG_DLL_PATH` or the local Debug output configured by the Quicker repo

## Agent Checklist

- [ ] Did you identify the Debug source type/method and record the full signature?
- [ ] Did you avoid hardcoding obfuscated Release type names?
- [ ] Does runtime lookup require exactly one match?
- [ ] Are failures surfaced as unavailable or a clear RPC error instead of null-reference crashes?
- [ ] Did you run the project build/test workflow after editing plugin, console, contracts, or build scripts?
