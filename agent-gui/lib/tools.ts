import { tool } from "ai";
import { z } from "zod";
import { DOCS_TOOL, DOCS_TOOL_DEF } from "@/lib/docs-tool.server";
import { QKRPC_FA_TOOL, QKRPC_FA_TOOL_DEF } from "@/lib/qkrpc-fa-tool";
import {
  QUICKER_SETTINGS_TOOL,
  QUICKER_SETTINGS_TOOL_DEF,
} from "@/lib/qkrpc-settings-tool";
import {
  QKRPC_ACTION_MANAGE_TOOL,
  QKRPC_ACTION_MANAGE_TOOL_DEF,
  QKRPC_ACTION_QUERY_TOOL,
  QKRPC_ACTION_QUERY_TOOL_DEF,
  QKRPC_ACTION_TOOL,
  QKRPC_ACTION_TOOL_DEF,
} from "@/lib/qkrpc-action-tool.server";
import {
  QKRPC_SUBPROGRAM_MANAGE_TOOL,
  QKRPC_SUBPROGRAM_MANAGE_TOOL_DEF,
  QKRPC_SUBPROGRAM_QUERY_TOOL,
  QKRPC_SUBPROGRAM_QUERY_TOOL_DEF,
  QKRPC_SUBPROGRAM_TOOL,
  QKRPC_SUBPROGRAM_TOOL_DEF,
} from "@/lib/qkrpc-subprogram-tool.server";
import {
  WORKSPACE_PROGRAM_TOOL,
  WORKSPACE_PROGRAM_TOOL_DEF,
} from "@/lib/workspace-program-tool.server";
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
  ASK_QUESTION_TOOL,
  ASK_QUESTION_TOOL_DEF,
} from "@/lib/ask-question-tool";

export const quickerTools = {
  [ASK_QUESTION_TOOL]: ASK_QUESTION_TOOL_DEF,
  [SET_THREAD_TITLE_TOOL]: SET_THREAD_TITLE_TOOL_DEF,
  [LAUNCHER_COMMAND_CACHE_TOOL]: LAUNCHER_COMMAND_CACHE_TOOL_DEF,
  [LAUNCHER_RESOLVE_TOOL]: LAUNCHER_RESOLVE_TOOL_DEF,
  [SHELL_EXEC_TOOL]: SHELL_EXEC_TOOL_DEF,
  [BROWSER_TOOL]: BROWSER_TOOL_DEF,
  [LLM_SETTINGS_TOOL]: LLM_SETTINGS_TOOL_DEF,
  [DEV_FRONTEND_CHECK_TOOL]: DEV_FRONTEND_CHECK_TOOL_DEF,
  [DOCS_TOOL]: DOCS_TOOL_DEF,
  [QUICKER_SETTINGS_TOOL]: QUICKER_SETTINGS_TOOL_DEF,
  [QKRPC_FA_TOOL]: QKRPC_FA_TOOL_DEF,
  [WORKSPACE_PROGRAM_TOOL]: WORKSPACE_PROGRAM_TOOL_DEF,
  [QKRPC_ACTION_QUERY_TOOL]: QKRPC_ACTION_QUERY_TOOL_DEF,
  [QKRPC_ACTION_TOOL]: QKRPC_ACTION_TOOL_DEF,
  [QKRPC_ACTION_MANAGE_TOOL]: QKRPC_ACTION_MANAGE_TOOL_DEF,
  [QKRPC_SUBPROGRAM_QUERY_TOOL]: QKRPC_SUBPROGRAM_QUERY_TOOL_DEF,
  [QKRPC_SUBPROGRAM_TOOL]: QKRPC_SUBPROGRAM_TOOL_DEF,
  [QKRPC_SUBPROGRAM_MANAGE_TOOL]: QKRPC_SUBPROGRAM_MANAGE_TOOL_DEF,

  qkrpc_action_delete: tool({
    description:
      "Permanently delete a local Quicker action (CLI: action delete --yes). Destructive: only when the user asked to delete. The chat UI shows Confirm/Cancel before execution.",
    needsApproval: true,
    inputSchema: z.object({
      id: z.string().uuid().describe("Action GUID to delete"),
    }),
    execute: async ({ id }: { id: string }) =>
      formatQkrpcResultForAgent(
        await runQkrpcForTool(["action", "delete", "--id", id, "--yes"]),
      ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needsApproval + execute
  } as any),

  qkrpc_subprogram_delete: tool({
    description:
      "Permanently delete a global subprogram. Destructive: only when the user asked to delete.",
    needsApproval: true,
    inputSchema: z.object({
      id: z.string().describe("Subprogram id or name to delete"),
    }),
    execute: async ({ id }: { id: string }) =>
      formatQkrpcResultForAgent(
        await runQkrpcForTool(["subprogram", "delete", "--id", id, "--yes"]),
      ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needsApproval + execute
  } as any),

  qkrpc_step_runner_search: tool({
    description:
      "Search StepRunner catalog (| OR, * wildcard). Non-empty query: items[].controlField { key, value, name? } (best match). OR (|) may also return items[].controlFields[] when multiple control modes match — pick the value for your branch, then step-runner get; do not guess. Empty query omits controlField.",
    inputSchema: z.object({
      query: z.string(),
      limit: z.number().int().min(1).max(80).optional(),
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
      "Agent-only StepRunner schema (step-runner get, not get-ui). Required before patching inputParams. Compressed JSON without module icon. controlField: copy items[].controlField.value from search when present. Without controlField, controlField.selection[] lists each mode with visibleInputKeys. See docs({ action: \"get\", topic: \"step-runner-get\" }).",
    inputSchema: z.object({
      key: z.string().describe("StepRunner key from search items[].key"),
      controlField: z
        .string()
        .optional()
        .describe("Required when search returned controlField; use controlField.value"),
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

/** Includes deprecated aliases for direct execute / old chat threads. */
export const allQuickerTools = {
  ...quickerTools,
  ...legacyQuickerToolAliases,
};
