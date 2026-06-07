---
name: quicker-run
description: "Use when running or debugging Quicker actions via qkrpc MCP (not editing program body)."
---

# quicker-run

Execute and inspect actions — **no** program-body editing. For authoring use **quicker-authoring**.

## MCP tools

| Intent | Tool |
|--------|------|
| Run action | `qkrpc_action` with run intent |
| Delete action | `qkrpc_action_delete` (destructive — confirm with user) |
| Generic op | `qkrpc_invoke` (e.g. `action.list`, `action.debug`) |

Prefer narrow tools over `qkrpc_invoke` when available.

## Before run

1. `qkrpc_health` or `qkrpc_wait` — plugin ready
2. Resolve `actionId` via `qkrpc_action` list/search (not guessed GUIDs)

## Debug / trace

- Step output: use debug/trace modes (CLI: `qkrpc action run --trace --json`)
- MCP: `qkrpc_invoke` op `action.debug` or action run with trace flags per tool schema

## Hard rules

- **Do not** use run tools to edit `data.json` — use **quicker-sync** + disk edit
- Destructive deletes need explicit user confirmation

Tool reference: see **qkrpc** skill `references/mcp-tools.md`.
