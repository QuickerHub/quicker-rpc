# {{#topic-title}}

**When**: edit **variables[]** in data.json. Step binding: **action-steps**; expressions: **expressions**.

## Write fields

| field | notes |
|-------|-------|
| `key` | name; varKey and `{name}` reference this |
| `varType` | lowercase English; **omit = text** |
| `default` | inline string; text/any need `""` not omit |
| `default.file` | file ref path when default lives in `files/…` |
| `desc` | optional |
| `isInput` / `isOutput` / `isLocked` / `saveState` | optional metadata |

Stable id is **key**. Row `id` if present is export/editor id — do not use as variable name.

## varType

| varType | meaning |
|---------|---------|
| *(omit)* | text |
| number, boolean, integer, table, list, dict, enum, datetime, image, object | typed |

Text / `any` without `default` → runtime **null** (not `""`). Hand-write `"default": ""` unless using file ref.

## Read-only aliases (import)

`type` (numeric VarType), `Type`, `var_type` — write as **varType** string. Legacy **defaultValue** / **defaultValue.file** / **defaultValueFile** — read/expand only.

## default / default.file

| binding | wire key | value |
|---------|----------|-------|
| inline string | `default` | plain string, e.g. `"42"`, `"$$Hello {name}"` |
| file ref | `default.file` | `files/myvar-default1.txt` |

Long default (>~4 lines / 240 chars) → file.

Inline interpolation: same $$/$= rules as inputParams.value — **expressions**.

## vs steps

- input: `{ "varKey": "<key>" }` (key string, not expression)
- output: string keys in outputParams (may `dictVar.entry`) — **action-steps**
- expressions: `{count}` in strings; write `{count}` not `v_count` — **expressions**

## quicker_in_param

Runtime input; NOT in variables[]. Use `{quicker_in_param}` — **expressions**.

## Related

action-steps · expressions · action-project-files · overview
