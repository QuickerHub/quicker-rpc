# {{#topic-title}}

**When**: overview P5 — pick stepRunnerKey. One query with OR/wildcards.

{{#only-cli}}
```powershell
{{@ step-runner.search}}
```
{{/only-cli}}
{{#only-agent}}
```text
{{@ step-runner.search}}
```
{{/only-agent}}

**Non-empty query**: modules with control enums return **`controlField`** `{ key, value, name? }` on matching items — default sub-mode for keyword. Modules without controls omit it. **Empty query** (or bare `*`): **browse** — returns curated common modules only (`step-runner-browse-modules.json`), no `controlField`. **Full catalog**: `step-runner list` (maintainers / UI), not search.

**OR query** (`|`): multiple control hits → **`controlField`** (best) + **`controlFields`** array (all hits, best first). Pick branch value before get.

Use `items[].key` for {{#ref step-runner.get.invoke}} (compressed JSON, no icon). **action-editor UI** uses `step-runner get-ui`. With **controlField**, get **must** pass {{#ref control-field.get}} = **controlField.value**; NO guessing. Often **one search** fixes key + control.

Ranking: match score (ModuleScore + ControlScore) + weight bias from `step-runner-agent-keywords.json`.

Maintainers: `obsolete: true` hides module from search; `obsoleteControlValues` hides control option; **`step-runner get` unaffected**. `notFor` tag excludes per query.

## Syntax

| feature | syntax |
|---------|--------|
| AND | space-separated |
| OR | `a\|b\|c` |
| wildcard | `*clip*`, `sys:*` (not bare `*` — use empty query for browse) |

Prefer **sys:assign** for single-variable writes (search `赋值`); **sys:evalexpression** for batch `{var}=`, LINQ, or complex C# (implementation-fallback). Search still lists dedicated modules.

## Related

step-runner-get · authoring-workflow (P5) · implementation-fallback · overview
