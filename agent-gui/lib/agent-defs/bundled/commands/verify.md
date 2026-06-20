---
description: Verify an action program — diagnostics and optional debug trace
argument-hint: "[action name or id]"
allowed-tools: workspace_program qkrpc_action_query qkrpc_action_get qkrpc_action_debug qkrpc_subprogram_get docs Read Grep qkrpc_wait
---

Verify the Quicker action matching: $ARGUMENTS (or the @-mentioned action when arguments are empty).

1. Run `workspace_program` **diagnostics** for the local `.quicker` project.
2. When runtime step output is needed, use **qkrpc_action_debug** (not `qkrpc_action_run`).
3. Summarize errors and warnings; for schema issues, cite `qkrpc_step_runner_get` keys — do not guess.

Do not patch unless the user explicitly asks to fix issues found.
