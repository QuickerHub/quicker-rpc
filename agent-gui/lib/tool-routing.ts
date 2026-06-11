/**
 * Compact tool-routing table injected into system prompts.
 * Keep in sync with tool descriptions — one row per intent, not per tool.
 * Workbench UI contract: lib/workbench-agent-prompt.ts
 */
const TOOL_ROUTING_ROWS = [
  "| User intent | Tool | Not |",
  "|-------------|------|-----|",
  // — Quicker RPC —
  "| Find action id | qkrpc_action_query | workspace_program; qkrpc_action_get |",
  "| Find global subprogram id | qkrpc_subprogram_query | embedded subprograms |",
  "| Run action | qkrpc_action_run | qkrpc_action_debug; workspace_program |",
  "| Debug / step output | qkrpc_action_debug | qkrpc_action_run |",
  "| Float popup | qkrpc_action_float | qkrpc_action_run |",
  "| Sync action to disk (first time) | qkrpc_action_get | After create — skip |",
  "| Sync global subprogram to disk | qkrpc_subprogram_get | After create — skip |",
  "| Edit steps/vars/files on disk | workspace_program | qkrpc_action patch; subprogram patch |",
  "| New empty action | qkrpc_action_create | qkrpc_profile_create |",
  "| New global subprogram | qkrpc_subprogram_create | workspace_program after |",
  "| Export/import subprogram dir | qkrpc_subprogram_export/import | workspace_program |",
  "| Subprogram UI edit | qkrpc_subprogram_edit | workspace_program body/vars |",
  "| Title/icon only | qkrpc_action_set_metadata + qkrpc_fa | workspace_program |",
  "| Move action on grid | qkrpc_action_move | workspace_program |",
  "| Action page tabs | qkrpc_profile_create/delete/reorder | qkrpc_action_create |",
  "| Virtual process layout | qkrpc_process_ensure | workspace_program |",
  "| Step module keys | qkrpc_step_runner_search → get | get-ui; guess keys |",
  "| Icons | qkrpc_fa search | guess fa: specs |",
  "| Quicker app settings | quicker_settings set/apply | open unless user needs UI |",
  "| Open settings panel | quicker_settings open (preset) | shell |",
  "| Stuck on authoring | docs get (one topic) | session-start spam |",
  "| Quicker not connected | qkrpc_wait | shell ping/probe/serve |",
  "| User preference | ask_question | delete confirm UI |",
  // — Workbench / disk —
  "| Read/write plain cwd file (.local, docs, config) | workspace_file | shell_exec; workspace_program |",
  "| Search file contents across cwd tree | shell_exec rg | workspace_file grep for single path |",
  "| Scratch/temp under cwd | workspace_file path `.local/…` | repo root; tracked trees unless asked |",
  "| Quicker program body (data.json, files/) | workspace_program | workspace_file; shell |",
  "| Save disk edits → Quicker | workspace_program patch | replace; qkrpc_action patch |",
  "| Post-patch syntax/lint | workspace_program_diagnostics | shell build for lint only |",
  "| Review disk edits / diff with user | Tell user: side panel 已改动 → Diff | shell git status/diff spam |",
  "| Shell/build/test/git commands | shell_exec | workspace_file; program body edits |",
  "| Internet facts / API docs | web_search | browser; docs; qkrpc_action_query |",
  "| User's logged-in browser (extension) | user_browser | browser (Playwright); shell |",
  "| Web UI / getquicker login (no extension) | browser | user_browser; web_search |",
  "| Chat LLM profiles | llm_settings | quicker_settings |",
  "| Delete | qkrpc_action_delete / qkrpc_subprogram_delete | only on user ask |",
  "| Launcher run/open (no @ mention) | launcher_resolve → ask_question if ambiguous | qkrpc_action_query + auto run |",
  "| agent-gui dev errors | dev_frontend_check | production |",
] as const;

export const TOOL_ROUTING_TABLE = TOOL_ROUTING_ROWS.join("\n");

export const TOOL_ROUTING_PROMPT = [
  "## Tool routing",
  "Pick exactly one tool from the table; params live in that tool's schema.",
  TOOL_ROUTING_TABLE,
].join("\n");
