/**
 * Compact tool-routing table injected into system prompts.
 * Keep in sync with tool descriptions — one row per intent, not per tool.
 */
export const TOOL_ROUTING_TABLE = `| User intent | Tool | Not |
|-------------|------|-----|
| Find action id | qkrpc_action_query | workspace_program; qkrpc_action_get |
| Find global subprogram id | qkrpc_subprogram_query | embedded subprograms |
| Run action | qkrpc_action_run | qkrpc_action_debug; workspace_program |
| Debug / step output | qkrpc_action_debug | qkrpc_action_run |
| Float popup | qkrpc_action_float | qkrpc_action_run |
| Sync action to disk (first time) | qkrpc_action_get | After create — skip |
| Sync global subprogram to disk | qkrpc_subprogram_get | After create — skip |
| Edit steps/vars/files on disk | workspace_program | qkrpc_action patch; subprogram patch |
| Save disk → Quicker | workspace_program patch | replace |
| New empty action | qkrpc_action_create | qkrpc_profile_create |
| New global subprogram | qkrpc_subprogram_create | workspace_program after |
| Export/import subprogram dir | qkrpc_subprogram_export/import | workspace_program |
| Subprogram UI edit | qkrpc_subprogram_edit | workspace_program body/vars |
| Title/icon only | qkrpc_action_set_metadata + qkrpc_fa | workspace_program |
| Move action on grid | qkrpc_action_move | workspace_program |
| Action page tabs | qkrpc_profile_create/delete/reorder | qkrpc_action_create |
| Virtual process layout | qkrpc_process_ensure | workspace_program |
| Step module keys | qkrpc_step_runner_search → get | get-ui; guess keys |
| Icons | qkrpc_fa search | guess fa: specs |
| Quicker app settings | quicker_settings set/apply | open unless user needs UI |
| Open settings panel | quicker_settings open (preset) | shell |
| Stuck on authoring | docs get (one topic) | session-start spam |
| Quicker not connected | qkrpc_wait | shell ping/probe/serve |
| User preference | ask_question | delete confirm UI |
| Shell/build/git | shell_exec | editing action body |
| Web / getquicker | browser | shell curl |
| Chat LLM profiles | llm_settings | quicker_settings |
| Delete | qkrpc_action_delete / qkrpc_subprogram_delete | only on user ask |
| Launcher unclear phrase | launcher_resolve → execute | workspace_program |
| agent-gui dev errors | dev_frontend_check | production |`;

export const TOOL_ROUTING_PROMPT = [
  "## Tool routing",
  "Pick exactly one tool from the table; params live in that tool's schema.",
  TOOL_ROUTING_TABLE,
].join("\n");
