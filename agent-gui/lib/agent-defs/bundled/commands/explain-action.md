---
description: Explain a Quicker action program (read-only step/variable walkthrough)
argument-hint: "[action name or id]"
allowed-tools: qkrpc_action_query qkrpc_action_get qkrpc_subprogram_query qkrpc_subprogram_get qkrpc_step_runner_search qkrpc_step_runner_get workspace_program docs Read Grep
---

Explain the Quicker action matching: $ARGUMENTS (or the @-mentioned action when arguments are empty).

Read-only — do not patch, run, debug, or write files.

1. Resolve the action/subprogram id (`qkrpc_action_query` / get or subprogram get).
2. Read program body from disk (`workspace_program read_data`) or get sync when needed.
3. Summarize: purpose, variables, step flow (module keys + key params), and non-obvious wiring.

Use plain language; no markdown tables. Cite step_runner_get when module param names matter.
