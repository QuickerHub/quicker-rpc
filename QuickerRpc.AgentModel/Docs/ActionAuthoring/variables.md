# Variables

Stable key: **`key`**. Patches target **`key`** (not ephemeral `id`).

## Types when writing

| `type` | `varType` when read |
|--------|---------------------|
| `0` | *(omitted = text)* |
| `1` | `number` |
| `2` | `boolean` |
| `12` | `integer` |
| `13` | `table` |
| … | See compressed read for other names |

`defaultValue` is always a **string** in JSON (`"42"`, `"true"`).

Patch/update may send `"varType": "integer"`; host normalizes to `type` on save.

## Binding

```json
"inputParams": { "text": { "varKey": "userName" } }
"outputParams": { "result": "myVar" }
```

Variable patch ops: same `op` vocabulary as steps in **`action_patch`** (see that tool’s description + topic **`patch-workflow`** example).
