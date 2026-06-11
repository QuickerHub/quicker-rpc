import { tool } from "ai";

import { z } from "zod";

import { DOCS_TOOL, DOCS_TOOL_DEF } from "@/lib/docs-tool.server";

import { QKRPC_FA_TOOL, QKRPC_FA_TOOL_DEF } from "@/lib/qkrpc-fa-tool";

import { QKRPC_WAIT_TOOL, QKRPC_WAIT_TOOL_DEF } from "@/lib/qkrpc-wait-tool";

import {

  QUICKER_SETTINGS_TOOL,

  QUICKER_SETTINGS_TOOL_DEF,

} from "@/lib/qkrpc-settings-tool";

import {

  QKRPC_ACTION_CREATE_TOOL,

  QKRPC_ACTION_CREATE_TOOL_DEF,

  QKRPC_ACTION_DEBUG_TOOL,

  QKRPC_ACTION_DEBUG_TOOL_DEF,

  QKRPC_ACTION_EDIT_TOOL,

  QKRPC_ACTION_EDIT_TOOL_DEF,

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
  QKRPC_SUBPROGRAM_CREATE_TOOL,
  QKRPC_SUBPROGRAM_CREATE_TOOL_DEF,
  QKRPC_SUBPROGRAM_EDIT_TOOL,
  QKRPC_SUBPROGRAM_EDIT_TOOL_DEF,
  QKRPC_SUBPROGRAM_EXPORT_TOOL,
  QKRPC_SUBPROGRAM_EXPORT_TOOL_DEF,
  QKRPC_SUBPROGRAM_GET_TOOL,
  QKRPC_SUBPROGRAM_GET_TOOL_DEF,
  QKRPC_SUBPROGRAM_IMPORT_TOOL,
  QKRPC_SUBPROGRAM_IMPORT_TOOL_DEF,
  QKRPC_SUBPROGRAM_QUERY_TOOL,
  QKRPC_SUBPROGRAM_QUERY_TOOL_DEF,
} from "@/lib/qkrpc-subprogram-tool.server";

import {

  WORKSPACE_PROGRAM_TOOL,

  WORKSPACE_PROGRAM_TOOL_DEF,

} from "@/lib/workspace-program-tool.server";

import {
  WORKSPACE_FILE_TOOL,
  WORKSPACE_FILE_TOOL_DEF,
} from "@/lib/workspace-general-file-tool.server";

import { legacyQuickerToolAliases } from "@/lib/legacy-tool-aliases";

import { formatQkrpcResultForAgent, runQkrpcForTool } from "@/lib/qkrpc";

import { LLM_SETTINGS_TOOL, LLM_SETTINGS_TOOL_DEF } from "@/lib/llm-settings-tool";

import { DEV_FRONTEND_CHECK_TOOL, DEV_FRONTEND_CHECK_TOOL_DEF } from "@/lib/dev-frontend-check-tool";

import { SHELL_EXEC_TOOL, SHELL_EXEC_TOOL_DEF } from "@/lib/shell-tool";

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
  USER_BROWSER_TOOL,
  USER_BROWSER_TOOL_DEF,
} from "@/lib/qkrpc-chrome-tool";

import {
  QUICKER_TRIGGER_TOOL,
  QUICKER_TRIGGER_TOOL_DEF,
} from "@/lib/qkrpc-trigger-tool";

import { WEB_SEARCH_TOOL_DEF } from "@/lib/web-search-tool.server";

import { WEB_SEARCH_TOOL } from "@/lib/web-search-tool-constants";

import {

  ASK_QUESTION_TOOL,

  ASK_QUESTION_TOOL_DEF,

} from "@/lib/ask-question-tool";

import { TASK_TOOL, TASK_TOOL_DEF } from "@/lib/task-tool.server";



export const quickerTools = {

  [ASK_QUESTION_TOOL]: ASK_QUESTION_TOOL_DEF,

  [TASK_TOOL]: TASK_TOOL_DEF,

  [SET_THREAD_TITLE_TOOL]: SET_THREAD_TITLE_TOOL_DEF,

  [LAUNCHER_COMMAND_CACHE_TOOL]: LAUNCHER_COMMAND_CACHE_TOOL_DEF,

  [LAUNCHER_RESOLVE_TOOL]: LAUNCHER_RESOLVE_TOOL_DEF,

  [SHELL_EXEC_TOOL]: SHELL_EXEC_TOOL_DEF,

  [BROWSER_TOOL]: BROWSER_TOOL_DEF,

  [USER_BROWSER_TOOL]: USER_BROWSER_TOOL_DEF,

  [WEB_SEARCH_TOOL]: WEB_SEARCH_TOOL_DEF,

  [LLM_SETTINGS_TOOL]: LLM_SETTINGS_TOOL_DEF,

  [DEV_FRONTEND_CHECK_TOOL]: DEV_FRONTEND_CHECK_TOOL_DEF,

  [DOCS_TOOL]: DOCS_TOOL_DEF,

  [QUICKER_SETTINGS_TOOL]: QUICKER_SETTINGS_TOOL_DEF,

  [QUICKER_TRIGGER_TOOL]: QUICKER_TRIGGER_TOOL_DEF,

  [QKRPC_FA_TOOL]: QKRPC_FA_TOOL_DEF,

  [QKRPC_WAIT_TOOL]: QKRPC_WAIT_TOOL_DEF,

  [WORKSPACE_PROGRAM_TOOL]: WORKSPACE_PROGRAM_TOOL_DEF,

  [WORKSPACE_FILE_TOOL]: WORKSPACE_FILE_TOOL_DEF,

  [QKRPC_ACTION_QUERY_TOOL]: QKRPC_ACTION_QUERY_TOOL_DEF,

  [QKRPC_ACTION_GET_TOOL]: QKRPC_ACTION_GET_TOOL_DEF,

  [QKRPC_ACTION_EDIT_TOOL]: QKRPC_ACTION_EDIT_TOOL_DEF,

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
  [QKRPC_SUBPROGRAM_EXPORT_TOOL]: QKRPC_SUBPROGRAM_EXPORT_TOOL_DEF,
  [QKRPC_SUBPROGRAM_IMPORT_TOOL]: QKRPC_SUBPROGRAM_IMPORT_TOOL_DEF,
  [QKRPC_SUBPROGRAM_EDIT_TOOL]: QKRPC_SUBPROGRAM_EDIT_TOOL_DEF,
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



  qkrpc_step_runner_search: tool({

    description:

      "Search StepRunner catalog before adding/editing steps — required when module key uncertain. NOT for running actions. "

      + "Syntax: space=AND; |=OR; *=wildcard. Prefer OR synonyms (提示框|msgbox|sys:*msg*); retry if empty. "

      + "Then qkrpc_step_runner_get with items[].key (+ controlField.value if present). NOT get-ui.",

    inputSchema: z.object({

      query: z

        .string()

        .describe("Search tokens; empty string browses catalog (avoid empty unless exploring)"),

      limit: z.number().int().min(1).max(80).optional().describe("Max results (default 20)"),

    }),

    execute: async ({ query, limit }) => {

      const args = ["step-runner", "search", "--query", query];

      if (limit != null) args.push("--limit", String(limit));

      return formatQkrpcResultForAgent(

        await runQkrpcForTool(args, { timeoutMs: 180_000 }),

      );

    },

  }),



  qkrpc_step_runner_get: tool({

    description:

      "Agent-only compressed StepRunner schema. Required before workspace_program step edits — do NOT guess inputParams. "

      + "Each input: key, valueType, variableMode (bind rule). Var bind: \"paramKey\":\"@var:varKey\" — NOT \"{varKey}\" in value. "

      + "Text interpolation: $$…{varKey}…; file: @file: or paramKey.file. NOT get-ui.",


    inputSchema: z.object({

      key: z.string().describe("items[].key from qkrpc_step_runner_search"),

      controlField: z

        .string()

        .optional()

        .describe("items[].controlField.value when search returned controlField"),

    }),

    execute: async ({ key, controlField }) => {

      const args = ["step-runner", "get", "--key", key];

      if (controlField) args.push("--control-field", controlField);

      return formatQkrpcResultForAgent(

        await runQkrpcForTool(args, { timeoutMs: 180_000 }),

      );

    },

  }),

};



/** Legacy aliases first; primary quickerTools win on id collision (split tools over routers). */

export const allQuickerTools = {

  ...legacyQuickerToolAliases,

  ...quickerTools,

};


