import { tool } from "ai";

import { z } from "zod";

import { LIST_TOOLS_TOOL, LIST_TOOLS_TOOL_DEF } from "@/lib/list-tools-tool.server";

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
import { getRequestLastUserText, getRequestThreadId } from "@/lib/qkrpc-request-context";
import { buildAgentTurnState } from "@/lib/agent-turn-state";
import {
  cacheStepRunnerSearch,
  getCachedStepRunnerSearch,
  noteFirstStepRunnerSearchQuery,
} from "@/lib/step-runner-search-cache";
import {
  cacheStepRunnerGet,
  getCachedStepRunnerGet,
} from "@/lib/step-runner-get-cache";
import {
  incrementStepRunnerSearchCountThisTurn,
} from "@/lib/program-turn-context";
import {
  evaluateStepRunnerSearchGuard,
  formatBlockedStepRunnerSearchResult,
} from "@/lib/step-runner-search-guard";
import { attachToolFeedback, isStructuredToolResult } from "@/lib/tool-result";
import { formatToolResultForAgent } from "@/lib/tool-result-agent-view";

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

import {

  ASK_QUESTION_TOOL,

  ASK_QUESTION_TOOL_DEF,

} from "@/lib/ask-question-tool";

import { TASK_TOOL, TASK_TOOL_DEF } from "@/lib/task-tool.server";
import { applyModelFacingToolOutputToToolMap } from "@/lib/tool-model-output";



const quickerToolsCore = {

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



  qkrpc_step_runner_search: tool({

    description:

      "Search StepRunner catalog before adding/editing steps — required when module key uncertain. NOT for running actions. "

      + "Query: space-separated terms try AND first; when empty, auto-retries as OR (any token). Use | for explicit OR; * wildcard. "

      + "Prefer short terms (剪贴板, writeClipboard). Avoid piling many synonyms in one query. "

      + "Then qkrpc_step_runner_get with items[].key (+ controlField.value if present). NOT get-ui.",

    inputSchema: z.object({

      query: z

        .string()

        .describe("Synonyms / keywords (space = match any token). Example: writeClipboard 剪贴板"),

      limit: z.number().int().min(1).max(80).optional().describe("Max results (default 20)"),

    }),

    execute: async ({ query, limit }) => {

      const threadId = getRequestThreadId();
      const cached = getCachedStepRunnerSearch(threadId, query);
      if (cached) {
        return formatToolResultForAgent(
          "qkrpc_step_runner_search",
          { query, limit },
          attachToolFeedback(cached, {
            summary: `Duplicate search "${query}" — reuse prior hits; call qkrpc_step_runner_get next.`,
            retryable: false,
          }) as Record<string, unknown>,
        );
      }

      const guard = evaluateStepRunnerSearchGuard(query);
      if (guard.block) {
        return formatBlockedStepRunnerSearchResult(query, limit, guard);
      }

      const args = ["step-runner", "search", "--query", query];

      if (limit != null) args.push("--limit", String(limit));

      const formatted = formatToolResultForAgent(
        "qkrpc_step_runner_search",
        { query, limit },
        formatQkrpcResultForAgent(
          await runQkrpcForTool(args, { timeoutMs: 180_000 }),
        ),
      );
      if (isStructuredToolResult(formatted)) {
        cacheStepRunnerSearch(threadId, query, formatted);
        noteFirstStepRunnerSearchQuery(threadId, query);
      }
      const searchCount = incrementStepRunnerSearchCountThisTurn();
      if (
        !guard.block
        && guard.orQueryHint
        && isStructuredToolResult(formatted)
        && formatted.ok
      ) {
        return formatToolResultForAgent(
          "qkrpc_step_runner_search",
          { query, limit },
          attachToolFeedback(formatted, {
            summary: guard.orQueryHint,
            retryable: false,
          }) as Record<string, unknown>,
        );
      }
      const userText = getRequestLastUserText()?.trim();
      if (
        userText
        && searchCount >= 3
        && isStructuredToolResult(formatted)
        && formatted.ok
      ) {
        const turnState = buildAgentTurnState({
          actionScope: { pinnedLatestAll: [] },
          chatMode: "agent",
          enabledToolIds: ["qkrpc_step_runner_search"],
          userText,
        });
        if (turnState.intent === "action_authoring") {
          return formatToolResultForAgent(
            "qkrpc_step_runner_search",
            { query, limit },
            attachToolFeedback(formatted, {
              summary:
                `${searchCount} step_runner_search calls — use one OR query (e.g. getClipboardText|writeClipboard|evalexpression) then qkrpc_step_runner_get on each distinct key.`,
              retryable: false,
            }) as Record<string, unknown>,
          );
        }
      }
      return formatted;

    },

  }),



  qkrpc_step_runner_get: tool({

    description:

      "Agent-only compressed StepRunner schema. Required before workspace_program step edits — do NOT guess inputParams. "

      + "Each input: key, valueType, variableMode (bind rule). Var bind: \"paramKey\":\"@var:varKey\" — NOT \"{varKey}\" in value. "

      + "Text interpolation: $$…{varKey}…; file: @file: or paramKey.file. NOT get-ui.",


    inputSchema: z
      .object({
        key: z
          .string()
          .optional()
          .describe("items[].key from qkrpc_step_runner_search (required)"),
        runnerKey: z
          .string()
          .optional()
          .describe("Alias of key — prefer key"),
        controlField: z
          .string()
          .optional()
          .describe("items[].controlField.value when search returned controlField"),
      })
      .refine((v) => Boolean(v.key?.trim() || v.runnerKey?.trim()), {
        message: "key (or runnerKey) is required",
      }),

    execute: async ({ key, runnerKey, controlField }) => {
      const resolvedKey = (key ?? runnerKey ?? "").trim();
      if (!resolvedKey) {
        return formatToolResultForAgent(
          "qkrpc_step_runner_get",
          { key, runnerKey, controlField },
          formatQkrpcResultForAgent({
            ok: false,
            exitCode: 1,
            source: "local",
            data: { error: "key (or runnerKey) is required" },
          }),
        );
      }

      const threadId = getRequestThreadId();
      const cached = getCachedStepRunnerGet(threadId, resolvedKey, controlField);
      if (cached) {
        return formatToolResultForAgent(
          "qkrpc_step_runner_get",
          { key: resolvedKey, controlField },
          attachToolFeedback(cached, {
            summary: `Duplicate get "${resolvedKey}" — reuse prior schema; do not call get again for this key.`,
            retryable: false,
          }) as Record<string, unknown>,
        );
      }

      const args = ["step-runner", "get", "--key", resolvedKey];

      if (controlField) args.push("--control-field", controlField);

      const formatted = formatToolResultForAgent(
        "qkrpc_step_runner_get",
        { key: resolvedKey, controlField },
        formatQkrpcResultForAgent(
          await runQkrpcForTool(args, { timeoutMs: 180_000 }),
        ),
      );
      if (isStructuredToolResult(formatted)) {
        cacheStepRunnerGet(threadId, resolvedKey, controlField, formatted);
      }
      return formatted;

    },

  }),

};

/** Chat tools: execute keeps full output for UI; toModelOutput strips displayData for LLM. */
export const quickerTools = applyModelFacingToolOutputToToolMap(quickerToolsCore);

/** Legacy aliases first; primary quickerTools win on id collision (split tools over routers). */
export const allQuickerTools = applyModelFacingToolOutputToToolMap({
  ...legacyQuickerToolAliases,
  ...quickerToolsCore,
});


