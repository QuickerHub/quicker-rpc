# {{#topic-title}}

**When**: edit **variables[]** in data.json. Step binding: **action-steps**; expressions: **expressions**.

## data.json variables[] schema

Shared base fields (action + subprogram):

| field | type | required | notes |
|-------|------|----------|-------|
| `key` | string | yes | stable id; `{key}` and step binds reference this |
| `varType` | string | no | omit = text |
| `default` | string | no | inline default — mutually exclusive with `default.file` |
| `default.file` | string | no | `files/…` path |
| `desc` | string | no | |
| `isLocked` | boolean | no | |
| `saveState` | boolean | no | |
| `id` | string | no | export/editor id — not the variable name |
| `group` | string | no | |
| `customType` | string | no | |

**Subprogram only** (when editing subprogram data.json):

| field | type | when | notes |
|-------|------|------|-------|
| `isInput` | boolean | IO | subprogram input parameter |
| `isOutput` | boolean | IO | subprogram output parameter |
| `paramName` | string | IO | display label; omit → use `key` |
| `inputParamInfo` | object | `isInput` | see **action-data-schema** JSON |
| `outputParamInfo` | object | `isOutput` | visibleExpression |
| `tableDef` | object | `varType=table` | column schema |

**Action**: do NOT set isInput/isOutput/paramName — use `{quicker_in_param}` (**expressions**).

Machine-readable full schema: `qkrpc guide get --topic action-data-schema --json`.

Stable id is **`key`**. Do not use row `id` as the variable name.

## varType

| varType | |
|---------|---|
| *(omit)* | text |
| number, boolean, integer, table, list, dict, enum, datetime, image, object | typed |

Text without `default` → runtime null (not `""`). Use `"default": ""` for empty string.

## default wire

Exactly one:

| wire key | value |
|----------|-------|
| `default` | plain string, e.g. `"42"`, `"$$Hello {name}"` |
| `default.file` | `files/myvar-default1.txt` |

Long default (>~4 lines / 240 chars) → `default.file`.

Inline interpolation: $$/$= rules — **expressions**.

Legacy `defaultValue` / `defaultValueFile` / `defaultValue.file` — read-only on import; write `default` / `default.file`.

## vs steps

- input bind: `paramKey.var` = `"<key>"` — **action-steps**
- output: `outputParams` string value — **action-steps**
- `{count}` in strings — **expressions** (interpolation ≠ var bind)

## quicker_in_param

Runtime input; NOT in variables[]. `{quicker_in_param}` — **expressions**.

## Related

action-steps · expressions · action-project-files · overview
