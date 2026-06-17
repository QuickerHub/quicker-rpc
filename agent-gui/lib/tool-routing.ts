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
  "| Auto-run on event | docs search 事件触发 OR quicker_trigger events query=… | qkrpc_action_run |",
  "| Add trigger rule | docs get trigger-workflow → events(eventType) → add | workspace_program |",
  "| Open settings panel | quicker_settings open (preset) | shell |",
  "| Authoring how-to / module refs | docs search → snippet | docs get full workflow |",
  "| Quicker not connected | qkrpc_wait | shell ping/probe/serve |",
  "| User preference | ask_question | delete confirm UI |",
  // — Workbench / disk —
  "| Read plain cwd file (.local, docs, config) | Read | Shell; workspace_program |",
  "| Write plain cwd file | Write | Shell; StrReplace; workspace_program |",
  "| Patch plain cwd file (oldString/newString) | StrReplace | Write; workspace_program |",
  "| Search file contents across cwd tree (regex) | Grep | Shell rg; Read search (single path, literal) |",
  "| Scratch/temp under cwd | Write/Read path `.local/…` | repo root; tracked trees unless asked |",
  "| Quicker program body (data.json, files/) | workspace_program | Read/Write; Shell |",
  "| Save disk edits → Quicker | workspace_program patch | replace; qkrpc_action patch |",
  "| Post-patch syntax/lint | workspace_program diagnostics | Shell build for lint only |",
  "| Review disk edits / diff with user | Tell user: side panel 已改动 → Diff | Shell git status/diff spam |",
  "| Shell/build/test/git commands | Shell | Read/Write; program body edits |",
  "| Internet facts / API docs | web_search | browser; docs; qkrpc_action_query |",
  "| User's logged-in browser (extension) | user_browser | browser (Playwright); shell |",
  "| Web UI / getquicker login (no extension) | browser | user_browser; web_search |",
  "| Show page in QuickerAgent side panel | browser + showPanel | user_browser |",
  "| Browser recording → action steps | browser_to_action | manual step authoring |",
  "| Chat LLM profiles | llm_settings | quicker_settings |",
  "| Delete action | qkrpc_action_delete | only on user ask |",
  "| Delete global subprogram | qkrpc_subprogram_delete | only on user ask |",
  "| Launcher run/open (no @ mention) | launcher_resolve → ask_question if ambiguous | qkrpc_action_query + auto run |",
  "| agent-gui dev errors | dev_frontend_check | production |",
] as const;

export const TOOL_ROUTING_TABLE = TOOL_ROUTING_ROWS.join("\n");

export const TOOL_ROUTING_PROMPT = [
  "## Tool routing",
  "After search when needed (see Search-first): pick one tool; params in tool schema.",
  TOOL_ROUTING_TABLE,
].join("\n");
