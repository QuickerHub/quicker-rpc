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

## Scenario skills

On-demand — full route table in parent **quicker-authoring** SKILL (`Scenario skills`). Hot: library-search, selection/clipboard pipeline, subprogram `var:*`, run-action-delegate, form-param-input.

## Pattern traps (do not guess)

- Library/shared: **read-only**; local write → `action create`
- Subprogram IO: **`var:<key>`** — not `text.var`
- `each`/`repeat` children: **`ifSteps`**; single branch: **`simpleIf`**
- `checkPathExists` → **`isExists`**; `simpleIf` **`$=`** / expr **`{var}`**
- `runAction` output: **`wait: True`** + `StartAction` get
- `sys:form`: long defs → **`formDef.file`**; headless trace **exempt** (UI)
- `regexExtract` → **`match1 `** (trailing space); `simpleIf` else+http → **`sys:if`**
- `windowOperations` maximize: **`type: show`** + **`showCmd: 3`**
- long evalexpression: **`expression.file`** → `files/*.eval.cs` + **apply**
- number var assign: **`Convert.ToDouble(n)`**; separate **`parseOk`** from `clipOk`

## P0–P7

{{#include-partial pipeline-p0-p7}}

## Hard rules

- NO shell_exec for qkrpc connectivity (ping, probe, serve, build.ps1 -t, qkrpc CLI) — tell user on connectivity_failure
- Search before guess (see system Search-first); docs search → items[].snippet; docs get(topic) only for full workflow
- NO guess inputParams without step_runner_search → get
- NO get-ui / step-runner.getUi
- NO inline patch / --patch-file (program body); `inputParams` JSON literals OK — action-data-schema
- After patch trust editVersion; NO re-get to verify
- P4: load **quicker-eval-expression** skill; expressions / evalexpression → module → csscript last

## Workspace

{{#include-partial schema-hot-workspace}}

{{#include-partial schema-hot-action-steps}}

Topic index below; deep-read via docs search (snippet). Full workflow → docs get(topic).
