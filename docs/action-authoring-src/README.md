# Action authoring — source templates

**Do not edit** `docs/action-authoring/cli/` or `docs/skills/quicker-authoring/` directly — they are generated.

Optional large sections: `references/{topic}.{name}.md` — included inline for CLI (`{{#include-reference}}`), emitted as `skills/quicker-authoring/references/{name}.md` for agent-ui (`docs_get_reference`).

**Cursor 开发**：指南在 `docs/skills/quicker-authoring/`（单 skill + references；与 QuickerAgent 安装包同源）；终端/Cursor Agent 也可用 `qkrpc guide get`。勿写入 `.cursor/skills/`（IDE 私有配置，不参与发布）。

## Edit here

| File | Role |
|------|------|
| `*.md` | Topic templates with markers |
| `ops.json` | Operation + phrase registry (`cli` / `agent` strings) |

**Agent 主路径**：`overview` → `authoring-workflow` → `workspace-editing`；领域规则见 `action-steps`、`action-variables`、`expressions` 等。CLI 专用：`patch-workflow`、`action-project-files`（`profiles: ["cli"]`）。

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
- `docs/skills/quicker-authoring/SKILL.md` + `references/*.md` + `topics.json` → read by agent-ui (`docs_get` tools; [Agent Skills](https://agentskills.io/specification) format)

## Add an operation

1. Add entry under `ops.json` → `ops` with `cli` and/or `agent` templates.
2. Use `{{param}}` placeholders + optional `defaults`.
3. Reference in templates via `{{@ your.op.id}}`.
