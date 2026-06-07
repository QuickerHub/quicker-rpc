# qkrpc MCP tool reference

Third-party MCP hosts expose these tools via `qkrpc mcp` (stdio). Prefer MCP over shell when configured.

## Connectivity

| MCP tool | CLI equivalent | Use |
|----------|----------------|-----|
| `qkrpc_health` | `qkrpc ping --json` | Plugin reachable? |
| `qkrpc_wait` | `qkrpc wait --json` | Poll until ready |

## Generic

| MCP tool | Use |
|----------|-----|
| `qkrpc_invoke` | Any serve op (`action.list`, `guide.get`, …) |

## Actions

| MCP tool | Use |
|----------|-----|
| `qkrpc_action` | CRUD, run, publish, metadata, profile |
| `qkrpc_action_delete` | Delete action (destructive) |

## Subprograms

| MCP tool | Use |
|----------|-----|
| `qkrpc_subprogram` | Global subprogram CRUD |
| `qkrpc_subprogram_delete` | Delete subprogram (destructive) |

## Workspace sync (third-party disk edit)

| MCP tool | Use |
|----------|-----|
| `qkrpc_sync` | `pull` / `push` / `status` for `.quicker/` |

No `workspace_program` in MCP — edit files, then `qkrpc_sync push`.

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
| `docs_index` | List authoring topics |
| `docs_get` | Read one topic |
| `docs_search` | Search authoring docs |

## Skill routing

| Task | Skill |
|------|-------|
| Connectivity / install | `qkrpc` |
| Write/edit actions | `quicker-authoring` |
| pull/push `.quicker/` | `quicker-sync` |
| Run/debug only | `quicker-run` |
