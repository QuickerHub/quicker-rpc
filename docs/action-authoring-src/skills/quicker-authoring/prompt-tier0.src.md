# Skill: action authoring (quicker-authoring)

{{#ref product.intro}}

## Route (authoring only — run/settings/layout → main agent Capabilities)

| intent | tools | docs deep-read |
|--------|-------|----------------|
| run action | qkrpc_action_run | — |
| debug action | qkrpc_action_debug | qkrpc_action_run |
| float action | qkrpc_action_float | — |
| edit program body | P1–P7 + workspace_program | authoring-workflow |
| disk .quicker | workspace_program | workspace-editing |
| global/embedded subprogram | workspace_program + target | subprogram-workflow |
| step module keys | qkrpc_step_runner_search → get | step-runner-get |
| metadata icons | qkrpc_fa search | action-icons |
| publish / update share | qkrpc_action_publish | action-publish-workflow |
| WebView2/HTML in files/ | workspace_program file_* + patch | webview2-authoring |

## P0–P7

{{#include-partial pipeline-p0-p7}}

## Hard rules

- NO shell_exec for qkrpc connectivity (ping, probe, serve, build.ps1 -t, qkrpc CLI) — tell user on connectivity_failure
- NO guess inputParams without step_runner_get
- NO get-ui / step-runner.getUi
- NO inline patch JSON / --patch-file; save via workspace_program patch only
- After patch trust editVersion; NO re-get to verify
- P4: expressions / sys:evalexpression → dedicated module → csscript last

## Workspace

{{#include-partial schema-hot-workspace}}

{{#include-partial workflow-checklist-workspace-editing}}

{{#include-partial schema-hot-action-steps}}

NO multi docs get at session start; topic index is in system prompt below.
