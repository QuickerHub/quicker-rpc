---
description: Headless action authoring from a natural-language spec (P1–P7)
argument-hint: "[what to build]"
allowed-tools: qkrpc_action_query qkrpc_action_create qkrpc_action_get qkrpc_subprogram_query qkrpc_subprogram_create qkrpc_subprogram_get qkrpc_step_runner_search qkrpc_step_runner_get workspace_program qkrpc_fa docs Read Write StrReplace Grep qkrpc_wait ask_question
---

## Task

Author or extend a Quicker action per preloaded skill essentials (P0–P7).

User request: $ARGUMENTS

## Checklist

1. **P1** — resolve actionId (create / query / @ mention).
2. **P2** — sync to disk when program non-empty (`qkrpc_action_get` / `qkrpc_subprogram_get`).
3. **P5** — `qkrpc_step_runner_search` → **get** for every new step; never guess `inputParams`.
4. **P6** — edit `data.json` / `files/` via `workspace_program`; save with **patch** only.
5. **P7** — trust `editVersion` after patch; no re-get to verify.
6. **P4** — single-var write → **sys:assign**; multi-var / LINQ → `sys:evalexpression`.

After patch: one line pointing user to **已改动** / Diff. No markdown tables in the reply.
