# Step-runner search

**When**: overview P5 — pick stepRunnerKey. One query with OR/wildcards.

```text
qkrpc_step_runner_search({ query: "clipboard|sys:*clip*" })
```

**Non-empty query**: modules with control enums return **`controlField`** `{ key, value, name? }` on matching items — default sub-mode for keyword. Modules without controls omit it. **Empty query**: browse only; no controlField.

**OR query** (`|`): multiple control hits → **`controlField`** (best) + **`controlFields`** array (all hits, best first). Pick branch value before get.

Use `items[].key` for **`qkrpc_step_runner_get`** (compressed JSON, no icon). **action-editor UI** uses `step-runner get-ui`. With **controlField**, get **must** pass **`controlField`** = **controlField.value**; NO guessing. Often **one search** fixes key + control.

Ranking: match score (ModuleScore + ControlScore) + weight bias from `step-runner-agent-keywords.json`.

Maintainers: `obsolete: true` hides module from search; `obsoleteControlValues` hides control option; **`step-runner get` unaffected**. `notFor` tag excludes per query.

## Syntax

| feature | syntax |
|---------|--------|
| AND | space-separated |
| OR | `a\|b\|c` |
| wildcard | `*clip*`, `sys:*` |

Prefer **sys:assign** for single-variable writes (search `赋值`); **sys:evalexpression** for batch `{var}=`, LINQ, or complex C# (implementation-fallback). Search still lists dedicated modules.

## Related

step-runner-get · authoring-workflow (P5) · implementation-fallback · overview
