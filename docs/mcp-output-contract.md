# MCP output contract (compact mode)

qkrpc MCP tools return **compact JSON by default** to reduce agent token use and improve prompt-cache stability.

## Shape

**Success (typical RPC op)**

```json
{
  "ok": true,
  "action": "get",
  "actionId": "...",
  "editVersion": 42,
  "compressed": { }
}
```

The legacy serve envelope `{ ok, data: { ok, action, payload } }` is flattened: `payload` fields are promoted to the top level next to `action`.

**Failure**

```json
{ "ok": false, "error": "MISSING_ACTION_ID", "message": "..." }
```

Executor validation errors stay as `{ "ok": false, "errorMessage": "..." }`.

## Omitted boilerplate (when default)

| Field | Rule |
|-------|------|
| `success` | Removed when outer `ok` is true |
| `readOnly` / `readOnlyReason` | Removed when `readOnly` is false |
| `patchAllowed` | Removed when true |
| `omitDefaultLiteralInputsApplied` | Removed when true |
| `subProgramCount` | Removed when 0 |
| `returnMode` | Always omitted in compact mode |
| `readSource` | Kept only for `action-designer` |
| List item empty strings | Removed from `action.list` / `action.search` rows |

## workspaceSync / workspaceProject

After `qkrpc_action_get` / `qkrpc_subprogram_get`, disk sync is summarized:

```json
"workspaceSync": { "ok": true, "projectDir": ".quicker/actions/{id}", "editVersion": 42 }
```

Full extract/export payloads (`writtenFiles`, absolute paths, etc.) are omitted — files are on disk under `projectDir`.

## Verbose legacy output

Set `QKRPC_MCP_VERBOSE=1` (or `true`) to disable compaction and emit the previous double-envelope JSON.

## CLI `--json`

CLI stdout is **unchanged** in this phase; only MCP tool strings use compact shaping (`QkrpcMcpResponseCompact`).

Implementation: `QuickerRpc.Console/Mcp/QkrpcMcpResponseCompact.cs`.
