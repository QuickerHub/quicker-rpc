# Quicker action authoring (quicker-authoring)

{{#ref product.intro}}

## Route (deep-read via docs get when stuck)

| intent | topic |
|--------|-------|
| edit program body | authoring-workflow |
| disk .quicker / workspace | workspace-editing |
| global/embedded subprogram | subprogram-workflow |
| step module keys | step-runner-search → step-runner-get |
| icons | action-icons |
| event trigger / auto-run | trigger-workflow |
| WebView2/HTML files | webview2-authoring |

## Scenario skills (on-demand)

Load sibling skills when the task matches (QuickerAgent catalog / Cursor `docs/skills/`):

| scenario | skill |
|----------|-------|
| public library search / exemplar | **quicker-action-library-search** |
| selected text read → transform → write | **quicker-authoring-selection-pipeline** |
| clipboard read → transform → write | **quicker-authoring-clipboard-pipeline** |
| HTTP + JSON field extract | **quicker-authoring-http-json-api** |
| each / simpleIf / break / continue | **quicker-authoring-loop-control** |
| one evalexpression, multi `{var}=` | **quicker-authoring-evalexpression-multi-var** |
| global subprogram extract + call | **quicker-authoring-subprogram-extract** |
| multi-file batch read/write | **quicker-authoring-file-batch** |
| expression-first data transform | **quicker-authoring-expression-first** |
| path exists + branch | **quicker-authoring-path-and-exists** |
| delay + retry poll | **quicker-authoring-delay-retry** |
| activate window + send keys | **quicker-authoring-ui-automation-lite** |
| run another action (delegate) | **quicker-authoring-run-action-delegate** |
| form → variables → format output | **quicker-authoring-form-param-input** |
| regex extract from text | **quicker-authoring-regex-extract-pipeline** |
| conditional HTTP (url guard) | **quicker-authoring-conditional-http** |
| file copy with timestamp | **quicker-authoring-file-copy-timestamp** |
| window title branch | **quicker-authoring-window-title-branch** |
| external `files/*.eval.cs` | **quicker-authoring-external-eval-cs** |
| clipboard CSV stats | **quicker-authoring-csv-parse-aggregate** |
| multi-step structure comments | **quicker-authoring-step-comments** |

Run/settings/layout → main agent Capabilities (not this skill).

## P0–P7

{{#include-partial pipeline-p0-p7}}

Walkthrough: authoring-workflow. Workspace: workspace-editing.

## Hard rules

- NO guess inputParams without step_runner_get
- NO get-ui / step-runner.getUi
- NO inline patch / --patch-file; workspace_program disk edit → patch
- trust editVersion after patch; NO verify re-get
- P4: **sys:assign** for single-var writes; `$=`/`$$`/batch evalexpression → module → csscript (load **quicker-eval-expression** skill)

## Deep-read index

| layer | topics |
|-------|--------|
| overview | overview |
| workflows | authoring-workflow, workspace-editing, subprogram-workflow, trigger-workflow |
| schemas | action-data-schema, expressions, action-project-files |
| expressions | **quicker-eval-expression** skill (+ topic `expressions`); multi-var → **quicker-authoring-evalexpression-multi-var** |
| scenarios | scenario skills table above (on-demand) |
| modules | step-modules; deep refs via docs search |

Hot route in prompt-tier0; workflows → docs get full; references/ → docs search snippets.
