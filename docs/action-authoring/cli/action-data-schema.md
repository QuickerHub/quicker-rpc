# Action data.json schema
<!-- qkrpc-search-aliases: bind, wire, variables, data.json, steps, inputParams -->

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

### Subprogram IO params (`isInput` / `isOutput`)

Subprogram variables[] only: `isInput` / `isOutput` expose the variable as a caller param; `paramName` = label. Per-param options live in **`inputParamInfo`** / **`outputParamInfo`** (camelCase keys, omit defaults; full field list in schema `#/definitions/inputParamInfo`):

| inputParamInfo | effect on caller step |
|----------------|----------------------|
| `isRequired`, `multiLine`, `validationPattern` | required flag · multi-line editor · regex check |
| `selectionItems` (+ `onlyUseSelect` / `allowInput`) | `value\|label` rows → select; lock to options / also allow free text |
| `isAdvanced` | collapsed into the **advanced** group in step editor |
| `visibleExpression` | show param only when expression truthy, e.g. `{mode}==1` |
| `skipEval` | **skip `{var}` interpolation and `$$` / `$=` parsing** — value passed verbatim (Text varType only) |

`outputParamInfo.visibleExpression` — same gating for output params.

**`skipEval` when**: param carries regex / template / code where `{...}` or `$` prefixes are literal payload, not Quicker expressions. Without it the caller's literal is interpolated once at call time.

## steps[]

`paramKey` names from **step_runner_get** — do not guess or invent `.var` / `.file` on wrong base name.

**stepId** (workspace disk edit): agents **omit** — order = array index; patch is save-only. QuickerAgent UI may add handles; runtime ignores stepId.

**inputParams** / **outputParams**: `outputParams` = `Record<string, string>`. **`inputParams`** values per `paramKey` (from `step-runner get` `valueType`):

| wire key | value |
|----------|--------|
| `paramKey` | string · number · boolean · **array** · **object** — pick JSON shape that matches param type |
| `paramKey.var` | `variables[].key` (string) |
| `paramKey.file` | `files/…` (string) |

| valueType (typical) | wire literal | avoid |
|---------------------|--------------|--------|
| Text | `"hello"`, `$$…`, `$=…` | — |
| Boolean | `true` / `false` or `"true"` / `"1"` | — |
| Number / Integer | `100` or `"100"` | — |
| **List** | `["a","b"]` | `"a\nb"` unless module requires multiline text |
| Dict | `{"k":"v"}` | guessing key=value lines |
| long text | `paramKey.file` | huge inline string |

Expressions (`$$` / `$=`) must be **strings**. Compare/omit defaults with normalized literals (`true` ≡ `"true"`, arrays compared via JSON).

```json
"inputParams": {
  "title": "Hello",
  "paths.var": "urls",
  "tags": ["a", "b"],
  "options": { "retry": 3 },
  "code.file": "files/filter.eval.cs",
  "stopIfFail": true,
  "expireSeconds": 100,
  "body": "$$mode=Encode&txt={text}"
}
```

**Schema `default`** (`step-runner get`) uses the same typing (e.g. Boolean → `default: true`). Omit `inputParams` entries equal to that default whether you wrote `true` or `"true"`.

**Omit schema defaults** — after `step-runner get`, drop literal `inputParams` matching the effective default (workspace `omitDefaultLiteralInputs` / `compress-module-ref-examples.mjs`). Keep: `.var` / `.file`, non-default literals, and any `$=` / `$$` string.

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
