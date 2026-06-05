# Action authoring — source templates

**Do not edit** `docs/action-authoring/cli/` or `docs/skills/quicker-authoring/` directly — they are generated.

**模块详解子目录**（推荐）：`references/{topic}/{id}.md` → 生成 `skills/quicker-authoring/references/{topic}/{id}.md`，Agent 用 `docs_get_reference({ topic, file: id })`。

可选大块附录（旧式扁平）：`references/{topic}.{name}.md` — CLI 可 `{{#include-reference}}` 内联；Agent 仍用 `docs_get_reference`（file = `name`）。

**Cursor 开发**：指南在 `docs/skills/quicker-authoring/`（单 skill + references；与 QuickerAgent 安装包同源）；终端/Cursor Agent 也可用 `qkrpc guide get`。勿写入 `.cursor/skills/`（IDE 私有配置，不参与发布）。

## Edit here

| File | Role |
|------|------|
| `*.md` | Topic templates with markers |
| `ops.json` | Topics (`title`, `description`), operations, phrases (`cli` / `agent`) |

**Agent 主路径**：`overview` → `authoring-workflow` → `workspace-editing`；领域规则见 `action-steps`、`action-variables`、`expressions` 等。模块用法见 **`step-modules`** + `references/step-modules/`（由 `node scripts/generate-step-module-refs.mjs` 从 [KC Help](https://getquicker.net/KC/Help) 生成）。CLI 专用：`patch-workflow`、`action-project-files`（`profiles: ["cli"]`）。

## Markers

| Syntax | Example |
|--------|---------|
| `{{#topic-title}}` | H1 from `topics.{id}.title` in `ops.json` |
| `{{#ref phrase-id}}` | `{{#ref product.intro}}` |
| `{{@doc topic}}` | `{{@doc patch-workflow}}` |
| `{{@ op-id key=value}}` | `{{@ action.patch id=guid N=3}}` |
| `{{#include-reference id}}` | 内联同 topic 附录（CLI 生成时展开） |
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
- `docs/skills/quicker-authoring/SKILL.md` + `references/{topic}/*.md` + `topics.json`（含 `referenceCatalog`）→ agent-ui `docs_get` / `docs_get_reference`

## Add an operation

1. Add entry under `ops.json` → `ops` with `cli` and/or `agent` templates.
2. Use `{{param}}` placeholders + optional `defaults`.
3. Reference in templates via `{{@ your.op.id}}`.
