import { tool } from "ai";

import { z } from "zod";

import { LIST_TOOLS_TOOL, LIST_TOOLS_TOOL_DEF } from "@/lib/list-tools-tool.server";

import { DOCS_TOOL, DOCS_TOOL_DEF } from "@/lib/docs-tool.server";

import { SKILL_LOAD_TOOL, SKILL_LOAD_TOOL_DEF } from "@/lib/skill-load-tool.server";

import { QKRPC_FA_TOOL, QKRPC_FA_TOOL_DEF } from "@/lib/qkrpc-fa-tool";

import { QKRPC_WAIT_TOOL, QKRPC_WAIT_TOOL_DEF } from "@/lib/qkrpc-wait-tool";
import { QKRPC_ACTION_OPEN_TOOL, QKRPC_ACTION_SAVE_TOOL } from "@/lib/qkrpc-action-source";
import { QKRPC_ACTION_OPEN_TOOL_DEF, QKRPC_ACTION_SAVE_TOOL_DEF } from "@/lib/qkrpc-action-source-tool.server";

import {

  QUICKER_SETTINGS_TOOL,

  QUICKER_SETTINGS_TOOL_DEF,

} from "@/lib/qkrpc-settings-tool";

import {
  QKRPC_ACTION_CREATE_TOOL,
  QKRPC_ACTION_CREATE_TOOL_DEF,
  QKRPC_ACTION_DEBUG_TOOL,
  QKRPC_ACTION_DEBUG_TOOL_DEF,
  QKRPC_ACTION_EDIT_VAR_TOOL,
  QKRPC_ACTION_EDIT_VAR_TOOL_DEF,
  QKRPC_ACTION_FLOAT_TOOL,
  QKRPC_ACTION_FLOAT_TOOL_DEF,
  QKRPC_ACTION_GET_TOOL,
  QKRPC_ACTION_GET_TOOL_DEF,
  QKRPC_ACTION_MOVE_TOOL,
  QKRPC_ACTION_MOVE_TOOL_DEF,
  QKRPC_ACTION_PUBLISH_TOOL,
  QKRPC_ACTION_PUBLISH_TOOL_DEF,
  QKRPC_ACTION_QUERY_TOOL,
  QKRPC_ACTION_QUERY_TOOL_DEF,
  QKRPC_ACTION_RUN_TOOL,
  QKRPC_ACTION_RUN_TOOL_DEF,
  QKRPC_ACTION_SET_METADATA_TOOL,
  QKRPC_ACTION_SET_METADATA_TOOL_DEF,
  QKRPC_PROCESS_ENSURE_TOOL,
  QKRPC_PROCESS_ENSURE_TOOL_DEF,
  QKRPC_PROFILE_CREATE_TOOL,
  QKRPC_PROFILE_CREATE_TOOL_DEF,
  QKRPC_PROFILE_DELETE_TOOL,
  QKRPC_PROFILE_DELETE_TOOL_DEF,
  QKRPC_PROFILE_PRUNE_TOOL,
  QKRPC_PROFILE_PRUNE_TOOL_DEF,
  QKRPC_PROFILE_REORDER_TOOL,
  QKRPC_PROFILE_REORDER_TOOL_DEF,
} from "@/lib/qkrpc-action-tool.server";

import {
  QKRPC_DESIGNER_OPEN_TOOL,
  QKRPC_DESIGNER_OPEN_TOOL_DEF,
} from "@/lib/qkrpc-designer-open-tool.server";

import {
  QKRPC_SUBPROGRAM_CREATE_TOOL,
  QKRPC_SUBPROGRAM_CREATE_TOOL_DEF,
  QKRPC_SUBPROGRAM_GET_TOOL,
  QKRPC_SUBPROGRAM_GET_TOOL_DEF,
  QKRPC_SUBPROGRAM_QUERY_TOOL,
  QKRPC_SUBPROGRAM_QUERY_TOOL_DEF,
} from "@/lib/qkrpc-subprogram-tool.server";

import {
  QKRPC_SUBPROGRAM_TRANSFER_TOOL,
  QKRPC_SUBPROGRAM_TRANSFER_TOOL_DEF,
} from "@/lib/qkrpc-subprogram-transfer-tool.server";

import {

  WORKSPACE_PROGRAM_TOOL,

  WORKSPACE_PROGRAM_TOOL_DEF,

} from "@/lib/workspace-program-tool.server";

import {
  READ_TOOL,
  READ_TOOL_DEF,
  STR_REPLACE_TOOL,
  STR_REPLACE_TOOL_DEF,
  WRITE_TOOL,
  WRITE_TOOL_DEF,
} from "@/lib/workspace-general-file-tool.server";

import { GREP_TOOL, GREP_TOOL_DEF } from "@/lib/grep-tool.server";

import { legacyQuickerToolAliases } from "@/lib/legacy-tool-aliases";

import { formatQkrpcResultForAgent, runQkrpcForTool } from "@/lib/qkrpc";
import { stepRunnerKnowledgeTools } from "@/lib/step-runner-knowledge-tools.server";

import { LLM_SETTINGS_TOOL, LLM_SETTINGS_TOOL_DEF } from "@/lib/llm-settings-tool";

import {
  DEV_FRONTEND_CHECK_TOOL,
  DEV_FRONTEND_CHECK_TOOL_DEF,
} from "@/lib/dev-frontend-check-tool.server";

import { SHELL_TOOL, SHELL_TOOL_DEF } from "@/lib/shell-tool";

import {

  SET_THREAD_TITLE_TOOL,

  SET_THREAD_TITLE_TOOL_DEF,

} from "@/lib/set-thread-title-tool";

import {

  LAUNCHER_COMMAND_CACHE_TOOL,

  LAUNCHER_COMMAND_CACHE_TOOL_DEF,

} from "@/lib/launcher/launcher-command-cache-tool";

import {

  LAUNCHER_RESOLVE_TOOL,

  LAUNCHER_RESOLVE_TOOL_DEF,

} from "@/lib/launcher/launcher-resolve-tool";

import { BROWSER_TOOL_DEF } from "@/lib/browser-tool.server";

import { BROWSER_TOOL } from "@/lib/browser-tool-constants";

import {
  BROWSER_TO_ACTION_TOOL,
  BROWSER_TO_ACTION_TOOL_DEF,
} from "@/lib/browser-to-action-tool.server";

import {
  USER_BROWSER_TOOL,
  USER_BROWSER_TOOL_DEF,
} from "@/lib/qkrpc-chrome-tool";

import {
  QUICKER_TRIGGER_TOOL,
  QUICKER_TRIGGER_TOOL_DEF,
} from "@/lib/qkrpc-trigger-tool";

import { WEB_SEARCH_TOOL_DEF } from "@/lib/web-search-tool.server";

import { WEB_SEARCH_TOOL } from "@/lib/web-search-tool-constants";

import { QUICKER_KNOWLEDGE_SEARCH_TOOL } from "@/lib/quicker-knowledge-tool-constants";

import { QUICKER_KNOWLEDGE_SEARCH_TOOL_DEF } from "@/lib/quicker-knowledge-tool.server";

import {

  ASK_QUESTION_TOOL,

  ASK_QUESTION_TOOL_DEF,

} from "@/lib/ask-question-tool";

import { TASK_TOOL, TASK_TOOL_DEF } from "@/lib/task-tool.server";
import { applyModelFacingToolOutputToToolMap } from "@/lib/tool-model-output";
import { assertValidAgentToolCatalog } from "@/lib/agent-tool-catalog";
import { QKRPC_TOOL_REGISTRY } from "@/lib/tool-registry";



const quickerToolsCore = {

  [SKILL_LOAD_TOOL]: SKILL_LOAD_TOOL_DEF,

  [ASK_QUESTION_TOOL]: ASK_QUESTION_TOOL_DEF,

  [TASK_TOOL]: TASK_TOOL_DEF,

  [SET_THREAD_TITLE_TOOL]: SET_THREAD_TITLE_TOOL_DEF,

  [LAUNCHER_COMMAND_CACHE_TOOL]: LAUNCHER_COMMAND_CACHE_TOOL_DEF,

  [LAUNCHER_RESOLVE_TOOL]: LAUNCHER_RESOLVE_TOOL_DEF,

  [SHELL_TOOL]: SHELL_TOOL_DEF,

  [BROWSER_TOOL]: BROWSER_TOOL_DEF,

  [BROWSER_TO_ACTION_TOOL]: BROWSER_TO_ACTION_TOOL_DEF,

  [USER_BROWSER_TOOL]: USER_BROWSER_TOOL_DEF,

  [WEB_SEARCH_TOOL]: WEB_SEARCH_TOOL_DEF,

  [QUICKER_KNOWLEDGE_SEARCH_TOOL]: QUICKER_KNOWLEDGE_SEARCH_TOOL_DEF,

  [LLM_SETTINGS_TOOL]: LLM_SETTINGS_TOOL_DEF,

  [DEV_FRONTEND_CHECK_TOOL]: DEV_FRONTEND_CHECK_TOOL_DEF,

  [LIST_TOOLS_TOOL]: LIST_TOOLS_TOOL_DEF,

  [DOCS_TOOL]: DOCS_TOOL_DEF,

  [QUICKER_SETTINGS_TOOL]: QUICKER_SETTINGS_TOOL_DEF,

  [QUICKER_TRIGGER_TOOL]: QUICKER_TRIGGER_TOOL_DEF,

  [QKRPC_FA_TOOL]: QKRPC_FA_TOOL_DEF,

  [QKRPC_WAIT_TOOL]: QKRPC_WAIT_TOOL_DEF,

  [WORKSPACE_PROGRAM_TOOL]: WORKSPACE_PROGRAM_TOOL_DEF,

  [READ_TOOL]: READ_TOOL_DEF,

  [WRITE_TOOL]: WRITE_TOOL_DEF,

  [STR_REPLACE_TOOL]: STR_REPLACE_TOOL_DEF,

  [GREP_TOOL]: GREP_TOOL_DEF,

  [QKRPC_ACTION_QUERY_TOOL]: QKRPC_ACTION_QUERY_TOOL_DEF,

  [QKRPC_ACTION_GET_TOOL]: QKRPC_ACTION_GET_TOOL_DEF,
  [QKRPC_ACTION_OPEN_TOOL]: QKRPC_ACTION_OPEN_TOOL_DEF,
  [QKRPC_ACTION_SAVE_TOOL]: QKRPC_ACTION_SAVE_TOOL_DEF,

  [QKRPC_DESIGNER_OPEN_TOOL]: QKRPC_DESIGNER_OPEN_TOOL_DEF,

  [QKRPC_ACTION_EDIT_VAR_TOOL]: QKRPC_ACTION_EDIT_VAR_TOOL_DEF,

  [QKRPC_ACTION_SET_METADATA_TOOL]: QKRPC_ACTION_SET_METADATA_TOOL_DEF,

  [QKRPC_ACTION_MOVE_TOOL]: QKRPC_ACTION_MOVE_TOOL_DEF,

  [QKRPC_ACTION_PUBLISH_TOOL]: QKRPC_ACTION_PUBLISH_TOOL_DEF,

  [QKRPC_ACTION_RUN_TOOL]: QKRPC_ACTION_RUN_TOOL_DEF,

  [QKRPC_ACTION_DEBUG_TOOL]: QKRPC_ACTION_DEBUG_TOOL_DEF,

  [QKRPC_ACTION_FLOAT_TOOL]: QKRPC_ACTION_FLOAT_TOOL_DEF,

  [QKRPC_ACTION_CREATE_TOOL]: QKRPC_ACTION_CREATE_TOOL_DEF,

  [QKRPC_PROFILE_CREATE_TOOL]: QKRPC_PROFILE_CREATE_TOOL_DEF,

  [QKRPC_PROFILE_DELETE_TOOL]: QKRPC_PROFILE_DELETE_TOOL_DEF,

  [QKRPC_PROFILE_PRUNE_TOOL]: QKRPC_PROFILE_PRUNE_TOOL_DEF,

  [QKRPC_PROFILE_REORDER_TOOL]: QKRPC_PROFILE_REORDER_TOOL_DEF,

  [QKRPC_PROCESS_ENSURE_TOOL]: QKRPC_PROCESS_ENSURE_TOOL_DEF,

  [QKRPC_SUBPROGRAM_QUERY_TOOL]: QKRPC_SUBPROGRAM_QUERY_TOOL_DEF,
  [QKRPC_SUBPROGRAM_GET_TOOL]: QKRPC_SUBPROGRAM_GET_TOOL_DEF,
  [QKRPC_SUBPROGRAM_TRANSFER_TOOL]: QKRPC_SUBPROGRAM_TRANSFER_TOOL_DEF,
  [QKRPC_SUBPROGRAM_CREATE_TOOL]: QKRPC_SUBPROGRAM_CREATE_TOOL_DEF,



  qkrpc_action_delete: tool({

    description:

      "Permanently delete one local Quicker action. ONLY when the user explicitly asked to delete. "

      + "NOT run/debug (qkrpc_action_run), NOT remove steps (workspace_program edit_data). UI shows Confirm/Cancel.",

    needsApproval: true,

    inputSchema: z.object({

      id: z.string().uuid().describe("Action GUID to delete permanently"),

    }),

    execute: async ({ id }: { id: string }) =>

      formatQkrpcResultForAgent(

        await runQkrpcForTool(["action", "delete", "--id", id, "--yes"]),

      ),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needsApproval + execute

  } as any),



  qkrpc_subprogram_delete: tool({

    description:

      "Permanently delete one global subprogram. ONLY when the user explicitly asked to delete. "

      + "NOT embedded subprograms inside actions. UI shows Confirm/Cancel.",

    needsApproval: true,

    inputSchema: z.object({

      id: z.string().describe("Global subprogram id or name to delete"),

    }),

    execute: async ({ id }: { id: string }) =>

      formatQkrpcResultForAgent(

        await runQkrpcForTool(["subprogram", "delete", "--id", id, "--yes"]),

      ),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needsApproval + execute

  } as any),



  ...stepRunnerKnowledgeTools,
};

assertValidAgentToolCatalog(QKRPC_TOOL_REGISTRY, quickerToolsCore);

/** Chat tools: execute keeps full output for UI; toModelOutput strips displayData for LLM. */
export const quickerTools = applyModelFacingToolOutputToToolMap(quickerToolsCore);

/** Legacy aliases first; primary quickerTools win on id collision (split tools over routers). */
export const allQuickerTools = applyModelFacingToolOutputToToolMap({
  ...legacyQuickerToolAliases,
  ...quickerToolsCore,
});


