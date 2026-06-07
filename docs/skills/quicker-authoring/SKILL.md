---
name: quicker-authoring
description: "Routes Quicker headless action editing (P0–P7): pick workflow topic, then schema/step-runner refs. Use when creating or editing Quicker actions, subprograms, steps, or data.json on disk."
allowed-tools: docs
compatibility: "QuickerAgent (agent-ui); requires Quicker + QuickerRpc plugin"
---

# Quicker action authoring (quicker-authoring)

Headless XAction via agent tools + QuickerRpc plugin. Route/hard rules preloaded; params in tool descriptions. Deep-read: docs get — do not paste guides in replies.

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

```text
Ph  Goal
──  ─────────────────────────────────────────
P0  Quicker + plugin; cwd / connectivity
P1  actionId (create / query / search)
P2  sync workspace (get → .quicker/actions/{id}/)
P3  metadata optional (set_metadata)
P4  pick impl: expressions first → module → csscript
P5  per step: step_runner_search → get (NO guess keys)
P6  edit data.json / files/ → save (patch or --patch-file)
P7  trust editVersion after save (NO verify re-get)
```

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
| schemas | action-steps, action-variables, expressions |
| modules | step-modules + docs get reference |

Hot route in prompt-tier0; docs get one topic at a time. docs index / search for unfamiliar topics.

