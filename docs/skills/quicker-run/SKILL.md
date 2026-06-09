---
name: quicker-run
description: "Use when running or debugging Quicker actions via qkrpc MCP (not editing program body)."
---

# quicker-run

Execute and inspect actions — **no** program-body editing. For authoring use **quicker-authoring**.

## MCP tools

| Intent | Tool |
|--------|------|
| Run action | `qkrpc_action_run` |
| Debug / trace | `qkrpc_action_debug` |
| Delete action | `qkrpc_action_delete` (destructive — confirm with user) |

## Before run

1. `qkrpc_health` or `qkrpc_wait` — plugin ready
2. Resolve `actionId` via `qkrpc_action_query` (not guessed GUIDs)

## Debug / trace

- Step output: `qkrpc_action_debug` (equivalent to CLI `qkrpc action run --trace --json`)

## Hard rules

- **Do not** use run tools to edit `data.json` — use host file tools + `workspace_program` patch
- Destructive deletes need explicit user confirmation

Tool reference: see **qkrpc** skill `references/mcp-tools.md`.
