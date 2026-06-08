---
name: qkrpc
description: "Use when calling Quicker through the local qkrpc CLI or MCP tools. Covers connectivity, qkrpc_wait, MCP-first over shell, and third-party agent limits (no workspace_program)."
---

# qkrpc

`qkrpc` is the local QuickerRpc CLI. When MCP is configured, prefer MCP tools over shell.

## Start here

1. `qkrpc_health` or `qkrpc ping --json` — plugin connectivity
2. On failure: `qkrpc_wait` (or MCP `qkrpc_wait`) — do **not** run repeated shell probes
3. `docs_get` topic `overview` — authoring entry (or `qkrpc guide get --topic overview --json`)

## MCP vs shell

| Situation | Use |
|-----------|-----|
| MCP host has qkrpc server | `qkrpc_health`, `qkrpc_wait`, `qkrpc_*` MCP tools |
| No MCP | Shell `qkrpc <subcommand> --json` (PATH must include qkrpc) |
| High frequency / HTTP client | `qkrpc serve` → `http://127.0.0.1:9477/health` |

Do **not** run install/probe loops when connectivity fails — tell the user to check Quicker + QuickerRpc plugin.

For **terminology** (QuickerAgent Quicker action vs AI agent), bootstrap URIs, and full connectivity decision tree, read **`quicker-rpc-knowledge`**.

## Third-party agents (not QuickerAgent)

- **No** `workspace_program` tool — edit `data.json` / `files/` on disk, then `qkrpc_sync push`
- **No** inline patch or `--patch-file` for program body
- Step-runner: `qkrpc_step_runner_search` → `qkrpc_step_runner_get` — never guess `inputParams`

For full authoring workflow, use the **quicker-authoring** skill. For pull/push `.quicker/`, use **quicker-sync**. For run-only, use **quicker-run**.

## MCP tool reference

See [references/mcp-tools.md](references/mcp-tools.md) for all MCP tool ids.

## Install / refresh

```powershell
qkrpc agent setup            # user-level MCP + skills + rules (default)
qkrpc agent setup --check    # verify config matches CLI version
qkrpc agent setup --upgrade  # refresh skills/rules only (preserve MCP config)
qkrpc agent setup --project  # also write project .cursor/mcp.json (opt-in)
```

Guide: `docs/agent-mcp-integration.md`
