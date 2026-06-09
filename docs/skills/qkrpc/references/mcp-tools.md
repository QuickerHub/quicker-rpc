# qkrpc MCP tool reference

Third-party MCP hosts expose these tools via `qkrpc mcp` (stdio). Prefer MCP over shell when configured.

**Disk editing**: MCP does **not** read/write `.quicker/` files. Use your host's file tools (Read/Write/StrReplace). Layout: MCP resource `quicker://workspace/readme`, `docs` topic `workspace-editing`, skill **quicker-authoring**.

## Connectivity

| MCP tool | CLI equivalent | Use |
|----------|----------------|-----|
| `qkrpc_health` | `qkrpc ping --json` | Plugin reachable? |
| `qkrpc_wait` | `qkrpc wait --json` | Poll until ready |

## Workspace sync (not file edit)

Requires `QKRPC_WORKSPACE_ROOT` (set by `qkrpc agent setup`).

| MCP tool | action | Use |
|----------|--------|-----|
| `workspace_program` | `projects_list` | List `.quicker` projects |
| | `reindex` | Refresh `index.json` |
| | `patch` | Save disk edits → Quicker |
| | `validate` | Pre-patch validation |
| | `diagnostics` | Post-patch syntax |

| MCP resource | Use |
|--------------|-----|
| `quicker://workspace/readme` | `.quicker/` layout + workflow (markdown) |
| `quicker://workspace/index` | Project index JSON |

Flow: `qkrpc_action_get` → **host file edit** → `workspace_program patch` → `qkrpc_action_run` or `qkrpc_action_debug`.

## Actions

| MCP tool | Use |
|----------|-----|
| `qkrpc_action_query` | Search/list actions |
| `qkrpc_action_get` | Load action + pull `.quicker/` |
| `qkrpc_action_create` | Create action + bootstrap `.quicker/` |
| `qkrpc_action_edit` | Open in Quicker UI |
| `qkrpc_action_edit_var` | Variable default edits |
| `qkrpc_action_set_metadata` | Title, icon, etc. |
| `qkrpc_action_move` | Move between profiles |
| `qkrpc_action_publish` | Publish shared action |
| `qkrpc_action_run` | Run (no trace) |
| `qkrpc_action_debug` | Run with step trace |
| `qkrpc_action_float` | Float window |
| `qkrpc_action_delete` | Delete (destructive) |
| `qkrpc_profile_*` | Profile management |
| `qkrpc_process_ensure` | Ensure background process |

## Subprograms

| MCP tool | Use |
|----------|-----|
| `qkrpc_subprogram_query` | Search global subprograms |
| `qkrpc_subprogram_get` | Load + pull `.quicker/subprograms/` |
| `qkrpc_subprogram_create` | Create |
| `qkrpc_subprogram_export` / `import` | Directory round-trip |
| `qkrpc_subprogram_edit` | Open in Quicker UI |
| `qkrpc_subprogram_delete` | Delete (destructive) |

## Authoring helpers

| MCP tool | Use |
|----------|-----|
| `qkrpc_step_runner_search` | Find step module keys (step 1 of 2) |
| `qkrpc_step_runner_get` | Compressed schema (step 2 of 2) |
| `qkrpc_fa` | Font Awesome icon search |

## Settings & docs

| MCP tool | Use |
|----------|-----|
| `quicker_settings` | Quicker app settings |
| `docs` | `action=index|search|get` — authoring guides |

## Skill routing

| Task | Skill |
|------|-------|
| Connectivity / install | `qkrpc` |
| Connection failed | `quicker-rpc-knowledge` |
| Write/edit actions | `quicker-authoring` |
| Run/debug only | `quicker-run` |
