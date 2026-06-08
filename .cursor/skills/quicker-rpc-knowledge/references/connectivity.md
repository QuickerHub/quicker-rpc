# Connectivity troubleshooting

## Detection layers

```text
Layer A  Quicker.exe running?
   └─ No  → user must start Quicker (bootstrap skipped intentionally)
   └─ Yes → Layer B

Layer B  Pipe \\.\pipe\QuickerRpc_Server_QRPC2026 exists?
   └─ No  → plugin not loaded → Layer C (bootstrap) or user manual start
   └─ Yes → Layer D

Layer C  Bootstrap (automatic)
   qkrpc tries quicker:runaction:aa5917ad-…?plugin once per wait/connect
   └─ Quicker not running → skip
   └─ Cooldown active (<120s since last launch in this qkrpc process) → skip launch
   └─ Launched → poll pipe up to 12s

Layer D  Pipe connect + Ping RPC
   └─ CONNECT_TIMEOUT → retry once; then user checklist
   └─ Success → ResetCooldown(); normal ops

Layer E  (QuickerAgent only) qkrpc serve :9477
   serve health = pipe Ping + protocol version
   └─ connection refused → serve not running (dev: build -t or manual serve)
   └─ unhealthy body → Layer B–D (plugin issue, not serve binary)
```

## Commands (prefer MCP when available)

```powershell
# Quick check
qkrpc ping --json

# Wait for plugin (default 120s, auto-bootstrap once)
qkrpc wait --json
qkrpc wait --timeout 60 --json

# Skip bootstrap (diagnostics only)
qkrpc ping --no-bootstrap --json

# Serve health (QuickerAgent / HTTP clients)
Invoke-RestMethod http://127.0.0.1:9477/health

# Smoke after plugin load
qkrpc action list --limit 1 --json
```

MCP: `qkrpc_health`, `qkrpc_wait` — same semantics.

## Error messages (Chinese CLI)

| Message fragment | Agent action |
|------------------|--------------|
| `QuickerRpc 插件未运行（命名管道不可用）` | User checklist; do not loop ping |
| `Quicker 进程未运行，已跳过 quicker:runaction` | Ask user to start Quicker |
| `已尝试通过 quicker:runaction 自动启动插件，但未检测到 RPC 管道` | Plugin action missing, load failed, or QuickerRpc_Run error — user runs action manually |
| `连接 QuickerRpc 管道超时` | Transient; one wait; check Quicker busy/hung |
| `QuickerRpc 在 Ns 内未就绪` | WAIT_TIMEOUT after full poll |

Hints array from CLI/MCP often includes manual URI — surface **one** URI to user, not repeated launches.

## User-facing fix order

1. Start **Quicker**.
2. Trigger plugin: click **QuickerAgent** action in Quicker, or run bootstrap URI once.
3. Confirm: `qkrpc ping --json` → success (or sidebar green in QuickerAgent).
4. **Developers** after git pull / plugin code change: `pwsh ./build.ps1 -t` from repo root.
5. **QuickerAgent dev** if HTTP tools fail: check `:9477` serve; restart via `-t` or sidebar redetect.

## What agents must not do

- Repeated `ping` / `curl` health loops
- `build.ps1 -t` inside QuickerAgent chat without user asking to fix dev environment
- Reinstall qkrpc / edit MCP config as first response
- Assume QuickerAgent.exe replaces plugin load

## What only the user/maintainer should do

- Install/load QuickerRpc plugin DLL in Quicker
- Run `build.ps1 -t` after C# changes
- Install/update QuickerAgent desktop app
- Fix Quicker crash or missing shared action subscription

## Integration test reference

Live pipe test (maintainers):

```powershell
dotnet test QuickerRpc.Test --filter FullyQualifiedName~QuickerRpcPipeIntegrationTests
```

Requires Quicker running + plugin loaded after `-t`.
