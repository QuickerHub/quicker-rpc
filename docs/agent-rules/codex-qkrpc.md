<!-- qkrpc-agent-setup:begin -->

## Quicker / qkrpc (MCP)

Configure `qkrpc` MCP per `docs/agent-mcp-self-install.md` in the quicker-rpc repo (or run the steps below once).

**Install (Codex, user-level):**

```powershell
codex mcp add qkrpc --env "QKRPC_WORKSPACE_ROOT=<workspace-root>" -- "$env:LOCALAPPDATA\Programs\qkrpc\qkrpc.exe" mcp
codex mcp list
```

Replace `<workspace-root>` with the project directory that contains or will contain `.quicker/`.

**Start:** `qkrpc_health` → on failure `qkrpc_wait` (no repeated shell probes).

**Authoring:** `docs` action=get topics `overview` → `authoring-workflow`. Step-runner: `qkrpc_step_runner_search` → `qkrpc_step_runner_get` — never guess `inputParams`.

**Disk edit:** MCP resource `quicker://workspace/readme` or `docs` topic `workspace-editing`. Edit `.quicker/` with your **file tools** → `workspace_program` action=patch.

**Re-install / upgrade CLI:** re-run MCP add with updated `qkrpc.exe` path; see `docs/agent-mcp-self-install.md`.

<!-- qkrpc-agent-setup:end -->
