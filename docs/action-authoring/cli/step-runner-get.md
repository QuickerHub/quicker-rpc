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
| get | inputParams/outputParams keys; visible fields |

Bind shapes: action-steps.

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

step-runner-search · action-steps · authoring-workflow
