---
name: qkrpc
description: "Use when calling Quicker through the local qkrpc CLI or MCP tools. Covers connectivity, qkrpc_wait, MCP-first over shell, and third-party disk editing via host file tools (not MCP file ops)."
---

# qkrpc

`qkrpc` is the local QuickerRpc CLI. When MCP is configured, prefer MCP tools over shell.

## Start here

1. `qkrpc_health` or `qkrpc ping --json` — plugin connectivity
2. On failure: `qkrpc_wait` — do **not** run repeated shell probes
3. `docs` action=get topic=overview — authoring entry

## MCP vs shell

| Situation | Use |
|-----------|-----|
| MCP host has qkrpc server | `qkrpc_health`, `qkrpc_wait`, `qkrpc_*` MCP tools |
| No MCP | Shell `qkrpc <subcommand> --json` |
| High frequency / HTTP | `qkrpc serve` → `http://127.0.0.1:9477/health` |

Do **not** run install/probe loops when connectivity fails — tell the user to check Quicker + QuickerRpc plugin.

For terminology and connectivity decision tree, read **`quicker-rpc-knowledge`**.

## Third-party agents (not QuickerAgent)

- **Disk edit**: host **Read/Write/StrReplace** on `.quicker/.../data.json` and `files/` — MCP has **no** file tools
- **Layout**: MCP resource `quicker://workspace/readme` or `docs` topic **workspace-editing**
- **Save to Quicker**: `workspace_program` `action=patch`
- **Pull**: `qkrpc_action_get` / `qkrpc_subprogram_get`
- **No** inline patch or `--patch-file` for program body
- Step-runner: `qkrpc_step_runner_search` → `qkrpc_step_runner_get` — never guess `inputParams`

Full authoring: **quicker-authoring** skill. Run-only: **quicker-run**.

## MCP tool reference

See [references/mcp-tools.md](references/mcp-tools.md).

## Install / refresh

**You (the agent) should run install yourself** when the user asks to connect Quicker — follow **`docs/agent-mcp-self-install.md`**.

| Host | Command |
|------|---------|
| Cursor | `qkrpc agent setup`（插件） |
| Codex | `qkrpc agent setup --codex --project --workspace <root>` |
| Check | `qkrpc agent setup --check` |
| Check (JSON) | `qkrpc agent setup --check --json` |
| Refresh plugin | `qkrpc agent setup --upgrade` |

Guides: `docs/agent-mcp-self-install.md`, `docs/agent-mcp-integration.md`
