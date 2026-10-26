# Step-runner schema (get)

**When**: P5 after search — before writing inputParams.

## Agent vs UI

| channel | call | returns |
|---------|------|---------|
| Agent/CLI | **`qkrpc_step_runner_get`** | compressed schema; NO module icon |
| UI only | step-runner get-ui | full schema + icon; action-editor ONLY |

FORBIDDEN get-ui / step-runner.getUi; use step_runner_get only

## vs search

| step | role |
|------|------|
| search | key, controlField, snippet |
| get | input keys, valueType, options (when set), required, **default**, fileExt, **docReference** |

**docReference** — when present, read module examples/traps via `docs_get_reference({ topic, file })` (from `docReference.topic` / `docReference.file`); prefer authored tier over KC crawl.

**default** — typed in **get** (`Boolean` → `true`/`false`, not `"1"`/`"0"`). **Steps** may use the same JSON types for plain literals, or strings (`"true"`, `$=…`, `$$…`); omit when value equals effective default (see action-data-schema).

Bind rules: action-data-schema — use exact `key`; variable bind `paramKey.var` not `{varKey}` in value.

```text
qkrpc_step_runner_get({ key: "sys:MsgBox" })
qkrpc_step_runner_get({ key: "sys:windowOperations", controlField: "move_ex" })
```

- controlField on search hit → pass **`controlField`** on get.

## Large schemas

If a result omits rules for the model budget, do not infer them from parameter names or repeat an identical full get. After search/get has bound the current host, use the same get with `read: { pointer: "", mode: "children", offset: 0 }` to list its current Agent schema body. CLI accepts this object as `--schema-read <JSON>`; this path only connects to an existing plugin.

Use returned JSON Pointers with `mode: "children"` to explore nested fields, or `mode: "value"` to read JSON text. Value pages preserve numeric tokens and long strings as text; the offset unit is UTF-16. Reassemble consecutive pages from offset zero before treating a selected value as complete. Use the exact returned `nextRead`, including its `expectedObservation`, to continue. A new pointer starts at zero with the same observation.

Every page reads the current definition again. A changed host/session, source, control value or schema rejects the continuation; start a new observation rather than joining different definitions. A new turn must first bind its current host again. Missing owners, unsupported older gateways and invalid pointers are explicit failures.

The body excludes the attached `knowledge` metadata, which is returned separately from the same read. `selectedComplete` describes the whole selected node only when read from zero without omission; `agentSchemaComplete` additionally requires a complete root value. Neither proves a full native definition, freshness beyond that read, or permission to edit. Unknown sources remain unknown, and live edits still require their separate native input contract.

## FORBIDDEN

- guess keys without get
- get-ui in automation
- wrong/missing controlField

## Related

step-runner-search · action-data-schema · authoring-workflow
