import type { Tool, ToolSet } from "ai";
import type { ChatMode } from "@/lib/chat-mode";
import { formatLocalToolResult } from "@/lib/tool-result";

const ASK_READ_ACTIONS: Readonly<Record<string, ReadonlySet<string>>> = {
  workspace_program: new Set([
    "projects_list", "read_data", "file_read", "file_info", "file_search", "diagnostics",
  ]),
  quicker_settings: new Set(["search", "list", "get", "pages", "links"]),
  // Even observations currently ensure a runtime/session; Ask must not invoke it.
  browser: new Set(),
};

/** Enforce the operation boundary of mixed read/write tools independently of the model. */
export function applyToolModeGuards<T extends ToolSet>(tools: T, mode: ChatMode): T {
  if (mode !== "ask") return tools;
  const guarded = { ...tools };
  for (const [toolId, definition] of Object.entries(tools)) {
    const allowedActions = ASK_READ_ACTIONS[toolId];
    const toolDefinition = definition as Tool;
    if (!allowedActions || !toolDefinition.execute) continue;
    const execute = toolDefinition.execute;
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
