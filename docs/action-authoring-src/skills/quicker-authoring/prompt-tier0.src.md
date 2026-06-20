# Skill: action authoring (quicker-authoring)

{{#ref product.intro}}

## Route (authoring only — run/settings/layout → main agent Capabilities)

| intent | tools | docs deep-read |
|--------|-------|----------------|
| run / debug / float | qkrpc_action_run / debug / float | — |
| edit program body | P1–P7 + workspace_program | authoring-workflow |
| disk .quicker | workspace_program | workspace-editing |
| global/embedded subprogram | workspace_program + target | subprogram-workflow |
| step module keys | qkrpc_step_runner_search → get | step-runner-get |
| metadata icons | qkrpc_fa search | action-icons |
| publish / update share | qkrpc_action_publish | action-publish-workflow |
| auto-run on event / trigger | quicker_trigger | trigger-workflow |
| WebView2/HTML in files/ | workspace_program file_* + patch | webview2-authoring |

## Docs tool

- data.json / steps[] / variables[] → **docs get action-data-schema** (schema+markdown; NOT docs search)
- known topic id (Route) → **docs get(topic)**; unknown keyword → search→snippet; module keys → step_runner get

## Scenario skills

On-demand — parent SKILL table. Hot: library-search, selection/clipboard pipeline, subprogram `var:*`, run-action-delegate, form-param-input.

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
- Search before guess; **docs get** for known topics (see Docs tool); **docs search** only when topic id unknown
- NO guess inputParams without step_runner_search → get
- NO get-ui / step-runner.getUi
- NO inline program-body patch / whole-program `--patch-file`; step `inputParams` literals per get
- After patch trust editVersion; NO re-get to verify
- P4: **sys:assign** single-var; **`$=`/`$$`/evalexpression** rules in preloaded **quicker-eval-expression** below; module → csscript last

## Workspace

{{#include-partial schema-hot-workspace}}

{{#include-partial schema-hot-action-steps}}
