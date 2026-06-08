# Action authoring — source templates

**Do not edit** `docs/action-authoring/cli/` or `docs/skills/quicker-authoring/` directly — they are generated.

## Layout

| Path | Role |
|------|------|
| `manifest/` | **Edit registry** — `skill.json`, `topics.json`, `phrases.json`, `operations.json` |
| `skills/quicker-authoring/SKILL.src.md` | L1 router → `SKILL.md` |
| `overview.md` | L1 overview topic (`docs get topic=overview`) |
| `workflows/` | P1–P7 and organization flows |
| `schemas/` | data.json shapes and rules |
| `catalogs/` | step-runner search/get/module catalog |
| `cli-only/` | CLI-only topics (`profiles: ["cli"]`) |
| `adjunct/` | Non-authoring paths (e.g. `quicker-ui`) |
| `partials/` | `{{#include-partial}}` shared fragments |
| `references/{topic}/` | Module deep refs (`docs_get_reference`) |

## Audience

Docs target **Agents** (QuickerAgent + `qkrpc guide` CLI consumers). Compressed English, tables, short rules. `{{#only-cli}}` / `{{#only-agent}}` only where invoke names differ.

## Markers

| Syntax | Example |
|--------|---------|
| `{{#topic-title}}` | H1 from `manifest/topics.json` |
| `{{#ref phrase-id}}` | `{{#ref product.intro}}` |
| `{{#include-partial name}}` | `{{#include-partial pipeline-p0-p7}}` |
| `{{@doc topic}}` | `{{@doc patch-workflow}}` |
| `{{@ op-id key=value}}` | `{{@ action.patch id=guid N=3}}` |
| `{{#only-cli}}…{{/only-cli}}` | CLI command examples |
| `{{#only-agent}}…{{/only-agent}}` | agent tool examples |

## Generate

```powershell
node scripts/generate-authoring-docs.mjs --force
npm run docs:check
```

### Partial catalog

| Partial | Used by |
|---------|---------|
| `doc-layers-table` | overview |
| `pipeline-p0-p7` | overview, SKILL.src.md |
| `errors-table` | overview |
| `topic-index-*` | overview |
| `workflow-checklist-p1-p7` | authoring-workflow |
| `workflow-checklist-workspace-editing` | workspace-editing |
| `workspace-editing-body` | workspace-editing |
| `expressions-body` | expressions |
| `workflow-checklist-subprogram` | subprogram-workflow |
| `workflow-checklist-action-organization` | action-organization-workflow |

## Add a topic

1. Add `topics.{id}` in `manifest/topics.json` with English `title`, `description`, `metadata.layer`, `source`.
2. Add template markdown at `source`.
3. Run `npm run docs:gen`.
