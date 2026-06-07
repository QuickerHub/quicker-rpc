# Action authoring — source templates

**Do not edit** `docs/action-authoring/cli/` or `docs/skills/quicker-authoring/` directly — they are generated.

## Layout (P0 refactor)

| Path | Role |
|------|------|
| `skills/quicker-authoring/SKILL.src.md` | **L1 路由** → 生成 `SKILL.md`（≤200 行正文） |
| `overview.md` + `*.md` topics | **L2–L4 专题** → CLI + `references/{topic}.md` |
| `partials/*.md` | 共享片段（`{{#include-partial}}`） |
| `references/{topic}/{id}.md` | 模块深参考（`docs_get_reference`） |
| `ops.json` | `skill` 元数据 + `topics` + `phrases` + `ops` |

**Agent 主路径**：`SKILL.md` 路由 → `docs_get authoring-workflow` → 按需 schema/catalog 专题。模块：`step-modules` + `references/step-modules/`（`npm run docs:modules:gen`）。

## Markers

| Syntax | Example |
|--------|---------|
| `{{#topic-title}}` | H1 from `topics.{id}.title` |
| `{{#ref phrase-id}}` | `{{#ref product.intro}}` |
| `{{#include-partial name}}` | `{{#include-partial pipeline-p0-p7}}` |
| `{{@doc topic}}` | `{{@doc patch-workflow}}` |
| `{{@ op-id key=value}}` | `{{@ action.patch id=guid N=3}}` |
| `{{#include-reference id}}` | CLI 内联附录 |
| `{{#only-cli}}…{{/only-cli}}` | CLI-only |
| `{{#only-agent}}…{{/only-agent}}` | agent-ui-only |

## Generate

```powershell
node scripts/generate-authoring-docs.mjs --force
# or: npm run docs:gen
```

Outputs:

- `docs/action-authoring/cli/` → `QuickerRpc.AgentModel` (`qkrpc guide`)
- `docs/skills/quicker-authoring/SKILL.md` + `references/` + `topics.json` → agent-ui `docs_get`

## Add a topic

1. Add `topics.{id}` in `ops.json` (`title`, `description`, `metadata.layer`, …).
2. Add `{id}.md` template at repo root of `action-authoring-src/` (or subfolder once manifest maps paths — P2).
3. Run `npm run docs:gen`.
