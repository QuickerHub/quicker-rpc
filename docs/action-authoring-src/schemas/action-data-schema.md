# {{#topic-title}}

**When**: create or edit **data.json** — steps[] + variables[] wire shape and authoring rules.

## JSON schema

`qkrpc guide get --topic action-data-schema --json` (or `docs_get` / agent `docs` action=get) → response field **`schema`** (`qkrpc.program-data.v1`), plus **`markdown`** prose below.

| programKind | variables[] |
|-------------|-------------|
| **action** | `#/definitions/variables/action` — base only; NO isInput/isOutput/paramName; runtime input = `{quicker_in_param}` |
| **subprogram** | `#/definitions/variables/subprogram` — base + IO + inputParamInfo/outputParamInfo/tableDef |

**steps[]** identical for both (`#/definitions/step`, `inputParams`, `outputParams`, `ifSteps`, `elseSteps`). Response includes **`template`** and **`example`** per programKind.

## variables[]

Stable id is **`key`** (not row `id`).

| varType | |
|---------|---|
| *(omit)* | text — no `default` → runtime null (not `""`); use `"default": ""` for empty string |
| number, boolean, integer, table, list, dict, enum, datetime, image, object | typed |

**default** — exactly one: `default` (inline string, `$$…`, `$=…`) or `default.file` (`files/…`). Long (>~4 lines / 240 chars) → `default.file`. Legacy `defaultValue` / `defaultValueFile` — read-only on import.

**quicker_in_param**: runtime input; NOT in variables[]. See **expressions**.

## steps[]

`paramKey` names from **step_runner_get** — do not guess or invent `.var` / `.file` on wrong base name.

**stepId** (workspace disk edit): agents **omit** — order = array index; patch is save-only. QuickerAgent UI may add handles; runtime ignores stepId.

**inputParams** / **outputParams**: `Record<string, string>`. Per catalog `paramKey`, exactly one wire entry:

| wire key | value |
|----------|-------|
| `paramKey` | literal, `$$…`, or `$=…` |
| `paramKey.var` | `variables[].key` |
| `paramKey.file` | `files/…` |

```json
"inputParams": {
  "title": "Hello",
  "paths.var": "urls",
  "code.file": "files/filter.eval.cs"
}
```

**Bind vs interpolate** — do not mix binds for the same `paramKey`:

| intent | wire | NOT |
|--------|------|-----|
| pass variable | `paramKey.var` | `"paramKey": "{varKey}"` |
| text mentions variable | `"paramKey": "$$Hello {varKey}"` | `paramKey.var` |
| C# compute | `$=…` or sys:evalexpression | `paramKey.var` |

`outputParams` value = target variable key (or `dictVar.entry`). Declare in `variables[]` first.

**Long text** (>4 lines): `paramKey.file`; evalexpression → `files/*.eval.cs`; formDef → `files/*.form.json` (**form-spec**).

**Branching** — only on branch step runners; **omit** empty `ifSteps` / `elseSteps`:

| stepRunnerKey | ifSteps | elseSteps |
|---------------|---------|-----------|
| `sys:if` | yes | yes (omit when empty) |
| `sys:simpleIf`, `sys:loop`, `sys:group`, … | yes | no |
| all other keys | **omit** | **omit** |

## Rules

- step_runner_get before writing keys
- expressions/evalexpression before csscript
- externalize long content

## Related

expressions · action-project-files · subprogram-workflow · step-runner-get · overview
