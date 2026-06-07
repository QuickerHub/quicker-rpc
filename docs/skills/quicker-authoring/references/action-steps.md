# Action steps

**When**: editing steps[], inputParams/outputParams, ifSteps/elseSteps. Keys must match step_runner_get.

## data.json steps[] schema

| field | type | required |
|-------|------|----------|
| `stepRunnerKey` | string | yes |
| `inputParams` | object | no |
| `outputParams` | object | no |
| `ifSteps` | steps[] | no |
| `elseSteps` | steps[] | no |
| `note` | string | no |
| `disabled` | boolean | no |
| `collapsed` | boolean | no |
| `delayMs` | number | no |
| `stepId` | string | no |

`paramKey` names from **step_runner_get** only — do not invent keys or `.var` / `.file` on the wrong base name.

## inputParams wire

`inputParams`: `Record<string, string>` — **every value is a plain string** (no nested objects on disk).

Per catalog `paramKey`, use **exactly one** wire entry:

| wire key | value |
|----------|-------|
| `paramKey` | literal, `$$…`, or `$=…` |
| `paramKey.var` | `variables[].key` string |
| `paramKey.file` | `files/…` path |

```json
"inputParams": {
  "title": "Hello",
  "paths.var": "urls",
  "code.file": "files/filter.eval.cs"
}
```

NO mixed binds for the same `paramKey` (never both `paramKey` and `paramKey.var`).

## outputParams wire

`outputParams`: `Record<string, string>` — value = target variable key (or `dictVar.entry`). Declare key in `variables[]` first.

## Bind vs interpolate

| intent | wire | NOT |
|--------|------|-----|
| pass variable | `paramKey.var` | `"paramKey": "{varKey}"` |
| text mentions variable | `"paramKey": "$$Hello {varKey}"` | `paramKey.var` |
| C# compute | `"paramKey": "$=…"` or sys:evalexpression | `paramKey.var` |

`{varKey}` in a string value requires `$$` or `$=` prefix — **expressions**.

## Long text

| case | wire |
|------|------|
| value >4 lines | `paramKey.file` |
| long evalexpression | `files/*.eval.cs` |
| formDef / webview HTML | `files/*.form.json` / `*.html` |

## Branching

sys:if — condition in inputParams; children in ifSteps/elseSteps. Single branch: sys:simpleIf.

## Rules

- step_runner_get before writing keys
- expressions/evalexpression before csscript
- externalize long content

## See also

action-variables · expressions · action-project-files · step-runner-search
