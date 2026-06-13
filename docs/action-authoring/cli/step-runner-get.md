# Step-runner schema (get)

**When**: P5 after search — before writing inputParams.

## Agent vs UI

| channel | call | returns |
|---------|------|---------|
| Agent/CLI | **`qkrpc step-runner get`** | compressed schema; NO module icon |
| UI only | step-runner get-ui | full schema + icon; action-editor ONLY |

FORBIDDEN step-runner get-ui in automation (action-editor UI only)

## vs search

| step | role |
|------|------|
| search | key, controlField, snippet |
| get | input keys, valueType, options (when set), required, **default**, fileExt, **docReference** |

**docReference** — when present, read module examples/traps via `docs_get_reference({ topic, file })` (from `docReference.topic` / `docReference.file`); prefer authored tier over KC crawl.

**default** — typed in **get** (`Boolean` → `true`/`false`, not `"1"`/`"0"`). **Steps** may use the same JSON types for plain literals, or strings (`"true"`, `$=…`, `$$…`); omit when value equals effective default (see action-data-schema).

Bind rules: action-data-schema — use exact `key`; variable bind `paramKey.var` not `{varKey}` in value.

```powershell
qkrpc step-runner get --key sys:MsgBox --json
qkrpc step-runner get --key sys:windowOperations --control-field move_ex --json
```

- controlField on search hit → pass **`--control-field <value>`** on get.

## FORBIDDEN

- guess keys without get
- get-ui in automation
- wrong/missing controlField

## Related

step-runner-search · action-data-schema · authoring-workflow
