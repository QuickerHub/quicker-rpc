# Terminology & naming

## QuickerAgent (Quicker action)

**QuickerAgent** is a **Quicker shared action** (动作), not a synonym for "AI agent" or Cursor.

- **Package**: getquicker shared action; subprogram **QuickerRpc_Run** loads `QuickerRpc.Plugin`.
- **Monitor / entry action id**: `7d6999ed-93a1-4db0-9763-5405066199ac` (`QuickerAgent.Start` in docs).
- **Desktop app**: Tauri shell `quicker-agent.exe` (built from `agent-gui/`). Installed separately from `qkrpc` CLI.
- **Chat agent**: the LLM inside QuickerAgent UI — one kind of **AI agent** that uses `qkrpc serve` tools.

When users say "Quicker 里的动作是 QuickerAgent", they mean the **Quicker action** that hosts the plugin and opens the Agent UI — not every automated assistant.

## QuickerRpc

Collective name for the RPC stack:

| Piece | Role |
|-------|------|
| `QuickerRpc.Plugin` | In-process server inside Quicker |
| `QuickerRpc.Contracts` | Pipe name, `IQuickerRpcService`, client |
| `QuickerRpc.Console` | `qkrpc.exe` CLI, `serve`, MCP |
| `QuickerRpc.AgentModel` | XAction compression, guides, step-runner metadata |

## qkrpc vs plugin

- **qkrpc** = out-of-process **client** (CLI, serve, MCP child).
- **Plugin** = in-process **server** (must be loaded by Quicker).
- Neither replaces the other; connectivity problems are almost always "plugin not listening on pipe".

## QuickerRpc_Run

Subprogram invoked from the QuickerAgent action. C# entry:

```csharp
Launcher.Start(_context);
```

Resolves `LauncherStartOptions` from the actual action context, including trigger and `quicker_in_param` (see main SKILL.md table). Use `StartFromQuickerInParam` only when the caller already has a defined string variable to pass explicitly; `quicker_in_param` is not an automatically declared C# identifier.

## Bootstrap action

Separate local/shared action id **`aa5917ad-1256-4c73-7022-08debe3efcbe`** used when:

- User installs plugin via `load …/QuickerRpc.Plugin.*.dll`
- `qkrpc` auto-starts RPC via `quicker:runaction:…?plugin`
- `build.ps1 -t` hot-reload at end of build

Mode `plugin` = RPC only, no QuickerAgent window, no version spam (bootstrap path).

## AI agent (generic)

Any automated assistant: Cursor Agent, Claude Code, QuickerAgent chat, custom HTTP client. They all talk to the **same pipe** (directly or via `qkrpc serve`).

## Common confusion

| Wrong | Right |
|-------|-------|
| "Start QuickerAgent.exe to enable RPC" | RPC comes from **plugin in Quicker**; exe is optional UI |
| "Reinstall qkrpc to fix plugin" | Fix **Quicker + plugin load**; CLI is usually fine |
| "QuickerAgent action = qkrpc.exe" | Action runs **plugin DLL** inside Quicker |
| Probe ping 10 times | **One** `qkrpc_wait`, then user checklist |
