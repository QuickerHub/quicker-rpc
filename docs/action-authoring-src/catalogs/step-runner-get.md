# {{#topic-title}}

**When**: P5 after search — before writing inputParams.

## Agent vs UI

| channel | call | returns |
|---------|------|---------|
| Agent/CLI | {{#ref step-runner.get.invoke}} | compressed schema; NO module icon |
| UI only | step-runner get-ui | full schema + icon; action-editor ONLY |

{{#ref step-runner.get-ui.forbidden}}

## vs search

| step | role |
|------|------|
| search | key, controlField, snippet |
| get | inputParams/outputParams keys; visible fields |

Bind shapes: action-steps.

{{#only-cli}}```powershell
{{@ step-runner.get}}
{{@ step-runner.get.control}}
```{{/only-cli}}
{{#only-agent}}```text
{{@ step-runner.get}}
{{@ step-runner.get.control}}
```{{/only-agent}}

- controlField on search hit → pass {{#ref control-field.get}} on get.

## FORBIDDEN

- guess keys without get
- get-ui in automation
- wrong/missing controlField

## Related

step-runner-search · action-steps · authoring-workflow
