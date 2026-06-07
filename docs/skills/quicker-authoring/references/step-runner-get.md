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
| get | inputParams/outputParams keys; visible fields |

Bind shapes: action-steps.

```text
qkrpc_step_runner_get({ key: "sys:MsgBox" })
qkrpc_step_runner_get({ key: "sys:windowOperations", controlField: "move_ex" })
```

- controlField on search hit → pass **`controlField`** on get.

## FORBIDDEN

- guess keys without get
- get-ui in automation
- wrong/missing controlField

## Related

step-runner-search · action-steps · authoring-workflow
