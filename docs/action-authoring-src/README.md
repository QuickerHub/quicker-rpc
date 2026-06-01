# Action authoring — source templates

**Do not edit** `docs/action-authoring/cli/` or `agent/` directly — they are generated.

## Edit here

| File | Role |
|------|------|
| `*.md` | Topic templates with markers |
| `ops.json` | Operation + phrase registry (`cli` / `agent` strings) |

## Markers

| Syntax | Example |
|--------|---------|
| `{{#ref phrase-id}}` | `{{#ref product.intro}}` |
| `{{@doc topic}}` | `{{@doc patch-workflow}}` |
| `{{@ op-id key=value}}` | `{{@ action.patch id=guid N=3}}` |
| `{{#only-cli}}…{{/only-cli}}` | CLI-only block |
| `{{#only-agent}}…{{/only-agent}}` | agent-ui-only block |

## Generate

```powershell
node ../../scripts/generate-authoring-docs.mjs
# or from repo root: npm run docs:gen
```

Runs automatically before `QuickerRpc.AgentModel` build and `agent-gui` dev/build.

Outputs:

- `docs/action-authoring/cli/` → embedded by `QuickerRpc.AgentModel` (`qkrpc guide`)
- `docs/action-authoring/agent/` → read by agent-ui (`docs_get` tools)

## Add an operation

1. Add entry under `ops.json` → `ops` with `cli` and/or `agent` templates.
2. Use `{{param}}` placeholders + optional `defaults`.
3. Reference in templates via `{{@ your.op.id}}`.
