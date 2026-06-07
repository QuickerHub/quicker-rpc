# Patch workflow (CLI)

**`qkrpc action patch`**: one call = one save. Before each new/changed step: **`qkrpc step-runner get`** (authoring-workflow P5).

## Top-level shape

```json
{
  "title": "optional",
  "description": "optional, \"\" clears",
  "icon": "<spec>",
  "steps": [ { "op": "add|update|remove|move", ... } ],
  "variables": [ { "op": "update", "key": "k", "defaultValue": "v" } ]
}
```

**Incremental patch** (default): may send only `steps` or only `variables`. Single step with only `stepRunnerKey` (no stepId/id, no ifSteps/elseSteps) → omit `op` = **add**. update/remove/move need explicit `op`.

**Full replace** (like `action replace`): `"replace": true` (or `"mode": "replace"`) + both **steps and variables** (may include `subPrograms`). Local data.json still steps+variables only.

### add placement (steps / variables)

| form | behavior |
|------|----------|
| `{ "stepRunnerKey": "...", "inputParams": { ... } }` | append root list (op optional) |
| `{ "containerPath": "1/if", "stepRunnerKey": "...", ... }` | append branch |
| `{ "op": "add", "index": N, ... }` | insert index (+ optional containerPath) |
| `{ "after": { "stepId": "..." }, ... }` | after anchor |
| `{ "before": { "stepId": "..." }, ... }` | before anchor |
| `{ "op": "add", "key": "x", "variable": ... }` | variable append (or afterKey/beforeKey/index) |

Metadata only: top-level `icon` (fa search) or **`qkrpc action set-metadata`**.

```powershell
qkrpc action patch --id <guid> --patch-file patch.json --expected-edit-version <N> --json
```

## inputParams rules

Keys from step-runner get `schema.Inputs[].Key`; unknown keys in **warnings[]** (exit 0 possible).

| case | write |
|------|-------|
| add | required + control + params differing from catalog Default |
| update | changed keys only; null old keys when switching module |
| value shapes | `paramKey` / `paramKey.file` / `paramKey.var` only (plain strings); `null` removes key |
| long value (>4 lines) | `"paramKey.file": "files/…"` — action-steps / action-project-files |

outputParams / inputParams shapes: **action-steps**.

## After save

| field | use |
|-------|-----|
| editVersion | next `--expected-edit-version` |
| addedSteps | new stepId |
| updatedSteps / updatedVariables | change summary |

Conflict → `qkrpc action get` or `force`.

## Related

authoring-workflow · action-steps · action-project-files · action-variables · overview
