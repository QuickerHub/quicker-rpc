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
| WebView2/HTML files | webview2-authoring |

Run/settings/layout → main agent Capabilities (not this skill).

## P0–P7

{{#include-partial pipeline-p0-p7}}

Walkthrough: authoring-workflow. Workspace: workspace-editing.

## Hard rules

- NO guess inputParams without step_runner_get
- NO get-ui / step-runner.getUi
- NO inline patch / --patch-file; workspace_program disk edit → patch
- trust editVersion after patch; NO verify re-get
- P4: expressions first → module → csscript

## Deep-read index

| layer | topics |
|-------|--------|
| overview | overview |
| workflows | authoring-workflow, workspace-editing, subprogram-workflow |
| schemas | action-data-schema, expressions, action-project-files |
| modules | step-modules + docs get reference |

Hot route in prompt-tier0; docs get one topic at a time. docs index / search for unfamiliar topics.
