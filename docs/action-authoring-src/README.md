# Action authoring — source templates

**Do not edit** `docs/action-authoring/cli/` or `docs/skills/quicker-authoring/` directly — they are generated.

## Layout

| Path | Role |
|------|------|
| `manifest/` | **Edit registry here** — `skill.json`, `topics.json`, `phrases.json`, `operations.json` |
| `skills/quicker-authoring/SKILL.src.md` | L1 路由 → `SKILL.md` |
| `overview.md` | L1 总览 topic（`docs_get topic=overview`） |
| `workflows/` | P1–P7 与整理流程 |
| `schemas/` | `data.json` 形状与规则 |
| `catalogs/` | step-runner 搜索/get/模块目录 |
| `cli-only/` | 仅 CLI 的 topic（`profiles: ["cli"]`） |
| `adjunct/` | 非编辑主路径（如 `quicker-ui`） |
| `partials/` | `{{#include-partial}}` 共享片段 |
| `references/{topic}/` | 模块深参考（`docs_get_reference`） |

## Markers

| Syntax | Example |
|--------|---------|
| `{{#topic-title}}` | H1 from `manifest/topics.json` |
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

## Add a topic

1. Add `topics.{id}` in `manifest/topics.json` with `title`, `description`, `metadata.layer`, `source` path.
2. Add template markdown at the `source` path.
3. Run `npm run docs:gen`.
