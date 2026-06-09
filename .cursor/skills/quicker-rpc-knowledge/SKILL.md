---
name: quicker-rpc-knowledge
description: >-
  Detailed QuickerRpc ecosystem knowledge: terminology (QuickerAgent Quicker action vs AI agent),
  architecture, named pipe, qkrpc serve, bootstrap, connectivity failure diagnosis.
  Use when qkrpc connection fails, PLUGIN_NOT_RUNNING, qkrpc_health/qkrpc_wait errors,
  serve 9477 unreachable, user asks how QuickerRpc or QuickerAgent works, or before telling
  the user to fix Quicker/plugin environment.
---

# QuickerRpc knowledge

Domain reference for **why** qkrpc connects the way it does and **what to do** when it fails. For day-to-day tool usage see **`qkrpc`**; for writing actions see **`quicker-authoring`**.

## Terminology (read first)

| Name | What it is | Not |
|------|------------|-----|
| **Quicker** | Desktop automation app (`Quicker.exe`) | — |
| **QuickerRpc plugin** | net472 DLL loaded inside Quicker; hosts RPC **server** on a named pipe | The CLI |
| **QuickerAgent** | **Quicker shared action** + desktop app (`quicker-agent.exe`, from `agent-gui/`) for AI chat / action editing | Generic "AI agent" or Cursor |
| **QuickerRpc_Run** | Subprogram inside the QuickerAgent action package; calls `Launcher.Start*` → starts RPC (+ optionally QuickerAgent UI) | `qkrpc.exe` |
| **qkrpc** | CLI client (`qkrpc.exe`); connects to plugin pipe or exposes `qkrpc serve` HTTP | Runs inside Quicker |
| **AI agent** | Cursor, Claude, QuickerAgent chat agent, etc. | The Quicker action named QuickerAgent |

**QuickerAgent action chain** (in Quicker):

```text
QuickerAgent.Start  (shared action, id 7d6999ed-93a1-4db0-9763-5405066199ac)
  └─ QuickerRpc_Run subprogram → QuickerRpc.Plugin.Launcher
       ├─ starts named-pipe RPC server
       └─ may launch quicker-agent.exe (desktop UI)
```

**Bootstrap action** (qkrpc auto-start when pipe missing):

- Action id: `aa5917ad-1256-4c73-7022-08debe3efcbe`
- URI: `quicker:runaction:aa5917ad-1256-4c73-7022-08debe3efcbe?plugin` (silent RPC only)

Full glossary: [references/terminology.md](references/terminology.md)

## Architecture (one screen)

```text
AI agent (Cursor / QuickerAgent chat / script)
    │
    ├─ MCP qkrpc_*  ──stdio──► qkrpc mcp ──┐
    ├─ HTTP ─────────────────► qkrpc serve :9477 ──┤
    └─ shell qkrpc ping/wait ──────────────────────┤
                                                   ▼
                              qkrpc.exe (pipe client)
                                                   │
                         named pipe QuickerRpc_Server_QRPC2026
                                                   ▼
                              QuickerRpc.Plugin (inside Quicker.exe)
                                                   ▼
                              Quicker UI thread / action services
```

- **Pipe name**: `QuickerRpc_Server_QRPC2026` (`QuickerRpcPipeNames.ServerPipe`)
- **Serve default**: `http://127.0.0.1:9477/health` (long-lived pipe; used by QuickerAgent)
- **Plugin must run inside Quicker** — qkrpc alone cannot serve Quicker APIs without the pipe

Details: [references/architecture.md](references/architecture.md)

## Connectivity failure — agent playbook

### Step 1: One check, one wait (no probe loops)

| Host | Do | Do not |
|------|-----|--------|
| MCP configured | `qkrpc_health` → on fail `qkrpc_wait` (once) | Repeated `ping`, shell loops, `build.ps1 -t` |
| Shell only | `qkrpc wait --json` (or `ping` once) | Install/reinstall qkrpc as first fix |
| QuickerAgent chat | Rely on sidebar RPC status; `qkrpc_wait` if tool exists | `shell_exec` ping/probe/serve/build |

**QuickerAgent chat hard rule**: on `connectivity_failure`, tell the user to check Quicker + plugin + serve — **stop**; no shell workaround unless user explicitly asks to fix the environment.

### Step 2: Interpret error codes

| Code / symptom | Meaning |
|----------------|---------|
| `PLUGIN_NOT_RUNNING` | Pipe file `\\.\pipe\QuickerRpc_Server_QRPC2026` absent — plugin not loaded |
| `CONNECT_TIMEOUT` | Pipe exists but connect hung (rare; retry once) |
| `WAIT_TIMEOUT` | Wait window exhausted; bootstrap may have been tried |
| HTTP 9477 connection refused | `qkrpc serve` not running (QuickerAgent dev: `build.ps1 -t` or start serve) |
| HTTP 9477 503 / unhealthy | serve up but **plugin** pipe down |

### Step 3: User checklist (plain language)

Tell the user to verify **in order**:

1. **Quicker is running** (`Quicker.exe`). If not, start Quicker first.
2. **QuickerRpc plugin loaded** — run QuickerAgent action once, or open shared action `aa5917ad-…`, or run `quicker:runaction:aa5917ad-1256-4c73-7022-08debe3efcbe?plugin`.
3. **QuickerAgent / dev**: if tools fail but Quicker is OK, ensure `qkrpc serve` on `:9477` (sidebar "重新检测" or `GET http://127.0.0.1:9477/health`).
4. **After repo plugin/CLI changes**: maintainer runs `pwsh ./build.ps1 -t` (hot-reload DLL + restart serve) — not the chat agent's job unless user asks.

### Step 4: Bootstrap behavior (why auto-start sometimes fails)

- qkrpc may launch `quicker:runaction:…?plugin` when pipe missing and Quicker is running.
- Skipped when **Quicker process not found** (avoids duplicate popups).
- **Cooldown ~120s** per process between bootstrap launches (`QuickerRpcBootstrapPolicy`).
- Bootstrap waits up to **12s** for pipe; `qkrpc wait` default up to **120s**.

Full decision tree: [references/connectivity.md](references/connectivity.md)

## QuickerRpc_Run start modes (`quicker_in_param`)

| Input / trigger | RPC | QuickerAgent UI | Notes |
|-----------------|-----|-----------------|-------|
| `?plugin` / bootstrap | ✓ | ✗ | Silent; qkrpc auto-start |
| `?agent` / manual click | ✓ | ✓ | Opens/brings forward `quicker-agent.exe` |
| `?agent-kill` | ✗ | kill | Context menu only |
| `ActionTrigger.Extern` (qkrpc external) | ✓ | ✗ | Version toast |
| `ActionTrigger.AutoRun` | ✓ | ✗ | Silent |

## Key paths & IDs

| Item | Location / value |
|------|------------------|
| qkrpc CLI | `%LOCALAPPDATA%\Programs\qkrpc\qkrpc.exe` |
| Plugin DLL (publish) | `publish/plugin/QuickerRpc.Plugin.*.dll` |
| Quicker test package | `%USERPROFILE%\Documents\Quicker\_packages\quicker.rpc\{X.Y.Z}\` |
| QuickerAgent workspace (installed) | `Documents/QuickerAgent/workspace` |
| QuickerAgent monitor action | `7d6999ed-93a1-4db0-9763-5405066199ac` |
| Plugin bootstrap action | `aa5917ad-1256-4c73-7022-08debe3efcbe` |

## Agent capability matrix

| Capability | QuickerAgent (chat) | Third-party MCP agent |
|------------|---------------------|------------------------|
| `workspace_program` file read/write | ✓ | ✗ — host file tools + `workspace_program` patch |
| `qkrpc serve` HTTP | ✓ default | optional |
| Visual step editor | ✓ | ✗ |
| Fix plugin / run `build.ps1 -t` | user / maintainer | user / maintainer |

## Related skills

| Situation | Skill |
|-----------|-------|
| Call qkrpc / MCP tools | `qkrpc` |
| Connection failed (this doc) | `quicker-rpc-knowledge` |
| Write/edit actions | `quicker-authoring` |
| `.quicker/` pull/push | `quicker-sync` |
| Run/debug only | `quicker-run` |
| After C# changes, hot-reload | `quicker-rpc-build-test` |

## Human docs

- [README.md](../../../README.md) — install, architecture
- [docs/agent-mcp-integration.md](../../../docs/agent-mcp-integration.md) — third-party MCP
- [docs/cli-commands.md](../../../docs/cli-commands.md) — CLI reference
- [AGENTS.md](../../../AGENTS.md) — repo agent rules
