import type { Tool, ToolSet } from "ai";
import type { ChatMode } from "@/lib/chat-mode";
import { formatLocalToolResult } from "@/lib/tool-result";

const ASK_READ_ACTIONS: Readonly<Record<string, ReadonlySet<string>>> = {
  workspace_program: new Set([
    "projects_list", "read_data", "file_read", "file_info", "file_search",
  ]),
  // Even observations currently ensure a runtime/session; Ask must not invoke it.
  browser: new Set(),
  // Source open writes bundle files; save includes host writes even though dry-run is offline.
  qkrpc_action_open: new Set(),
  qkrpc_action_save: new Set(),
};
// These adapters may bootstrap Quicker/serve even for a nominal read. Restore each
// capability only after it has an explicit connection-only execution port.
const ASK_UNAVAILABLE_REMOTE_TOOL_IDS = new Set([
  "qkrpc_wait", "qkrpc_action_query", "qkrpc_subprogram_query",
  "qkrpc_step_runner_search", "qkrpc_step_runner_get", "qkrpc_fa",
  "launcher_resolve", "quicker_settings", "workspace_program_diagnostics",
]);
const ASK_PROGRAM_GET_TOOL_IDS = new Set(["qkrpc_action_get", "qkrpc_subprogram_get"]);
export type ReadOnlyToolExecutors = Readonly<Record<string, NonNullable<Tool["execute"]> | undefined>>;

/** Enforce the operation boundary of mixed read/write tools independently of the model. */
export function applyToolModeGuards<T extends ToolSet>(tools: T, mode: ChatMode, readOnlyExecutors: ReadOnlyToolExecutors = {}): T {
  if (mode !== "ask") return tools;
  const guarded = { ...tools };
  for (const [toolId, definition] of Object.entries(tools)) {
    const allowedActions = ASK_READ_ACTIONS[toolId];
    const toolDefinition = definition as Tool;
    if (ASK_UNAVAILABLE_REMOTE_TOOL_IDS.has(toolId)) {
      (guarded as ToolSet)[toolId] = {
        ...toolDefinition,
        execute: () => formatLocalToolResult(
          { errorCode: "tool_mode_denied", toolId, mode }, false,
          `Ask mode cannot use ${toolId}: its current adapter may start Quicker or serve. A non-bootstrapping read port is required.`,
          { retryable: false },
        ),
      } as Tool;
      continue;
    }
    if (ASK_PROGRAM_GET_TOOL_IDS.has(toolId)) {
      (guarded as ToolSet)[toolId] = {
        ...toolDefinition,
        execute: readOnlyExecutors[toolId] ?? (() => formatLocalToolResult(
          { errorCode: "tool_mode_denied", toolId, mode }, false,
          `Ask mode requires a read-only execution port for ${toolId}; workspace export is unavailable.`,
          { retryable: false },
        )),
      } as Tool;
      continue;
    }
    if (toolId === "workspace_program" && !readOnlyExecutors[toolId]) {
      (guarded as ToolSet)[toolId] = {
        ...toolDefinition,
        execute: () => formatLocalToolResult({ errorCode: "tool_mode_denied", toolId, mode }, false,
          "Ask workspace reads require an explicit local-only execution port; automatic project export and repair are unavailable.",
          { retryable: false }),
      } as Tool;
      continue;
    }
    if (!allowedActions || !toolDefinition.execute) continue;
    const execute = toolId === "workspace_program" ? readOnlyExecutors[toolId]! : toolDefinition.execute;
    (guarded as ToolSet)[toolId] = {
      ...toolDefinition,
      execute: async (input, options) => {
        const action = input && typeof input === "object"
          ? (input as Record<string, unknown>).action
          : undefined;
        if (
          typeof action !== "string"
          || !allowedActions.has(action)
        ) {
          return formatLocalToolResult(
            { errorCode: "tool_mode_denied", toolId, mode, action: action ?? null },
            false,
            toolId === "browser"
              ? "Browser is unavailable in Ask mode because the current adapter may start a runtime or create a session. Use Agent mode for browser actions."
              : toolId === "workspace_program" && action === "diagnostics"
                ? "Diagnostics are unavailable in Ask mode because the current adapter may start Quicker. Local program and file reads remain available."
              : `Ask mode only permits read operations for ${toolId}. Switch to Agent mode to make changes.`,
            { retryable: false },
          );
        }
        return execute(input, options);
      },
    } as Tool;
  }
  return guarded;
}
