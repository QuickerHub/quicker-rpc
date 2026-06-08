# Architecture reference

## Request path (typical QuickerAgent chat)

```text
Browser / Tauri WebView (agent-gui)
  POST http://127.0.0.1:9477/v1/invoke  { op, args }
       ↓
qkrpc serve (QuickerRpc.Console)
  QkrpcRpcSessionPool → reuse one pipe connection
       ↓
NamedPipeClientStream → QuickerRpc_Server_QRPC2026
       ↓
QuickerRpcServer (plugin) → dispatch on Quicker UI thread
       ↓
HeadlessActionProgramService, search, patch, run, …
```

Fallback when serve down: agent-gui may spawn `qkrpc <subcommand>` subprocess (slower).

## Request path (Cursor MCP)

```text
Cursor → qkrpc mcp (stdio) → ConnectAsync → pipe → plugin
```

No HTTP unless host also runs `qkrpc serve`.

## Plugin lifetime

- Started by `Launcher.Start*` from QuickerRpc_Run (or test harness).
- Pipe server listens until Quicker exits or plugin unloaded.
- **Reload**: new DLL via `load` + run action, or `build.ps1 -t` triggers `quicker:runaction:…`.
- Running **qkrpc serve** survives plugin reload if pool reconnects (`InvalidateAsync` on next request).

## Version coupling

| Change | Needs |
|--------|-------|
| Plugin-only behavior | `build.ps1 -t` (revision bump) |
| New public Launcher API used by QuickerRpc_Run | Third semver +1 publish (`quicker-qkbuild-version-publish`) |
| CLI-only | `-t` updates `%LOCALAPPDATA%\Programs\qkrpc\` |
| Skills/docs in repo | `docs/skills/*`; Cursor: `qkrpc agent setup --upgrade` |

## Module map (repo)

| Project | Agent-relevant |
|---------|----------------|
| `QuickerRpc.Plugin` | RPC server, Launcher, QuickerAgentLaunchService |
| `QuickerRpc.Console` | CLI, serve, MCP, agent setup |
| `QuickerRpc.Contracts` | QuickerRpcClient, bootstrap policy |
| `QuickerRpc.AgentModel` | Guides embedded in `qkrpc guide get` |
| `agent-gui/` | QuickerAgent UI; not required for third-party MCP |

## External docs

- Pipe + StreamJsonRpc: [README.md](../../../README.md) §架构
- Serve ops: `qkrpc serve openapi --json`
- MCP tool list: [docs/skills/qkrpc/references/mcp-tools.md](../../qkrpc/references/mcp-tools.md)
