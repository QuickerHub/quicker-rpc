import type { Tool, ToolSet } from "ai";
import type { ChatMode } from "@/lib/chat-mode";
import { formatLocalToolResult } from "@/lib/tool-result";

const ASK_READ_ACTIONS: Readonly<Record<string, ReadonlySet<string>>> = {
  workspace_program: new Set([
    "projects_list", "read_data", "file_read", "file_info", "file_search", "read_live",
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
export type ToolOperationConstraint = Readonly<{ allowedActions: readonly string[] }>;
export type ToolOperationConstraints = Readonly<Record<string, ToolOperationConstraint | undefined>>;
export type ToolModeGuardOptions = Readonly<{
  operationConstraints?: ToolOperationConstraints;
  /** Explicit read ports implemented by the renderer, never by a server fallback. */
  clientReadonlyTools?: readonly string[];
}>;

export type ToolModeDecision = { allowed: true } | { allowed: false; reason: string };
const ALLOWED: ToolModeDecision = Object.freeze({ allowed: true });

function askReadActions(toolId: string): ReadonlySet<string> | undefined {
  return Object.hasOwn(ASK_READ_ACTIONS, toolId) ? ASK_READ_ACTIONS[toolId] : undefined;
}

/** Intrinsic mode constraints only; final tool composition still owns membership and parent restrictions. */
export function getToolModeAvailability(toolId: string, mode: ChatMode, readOnlyExecutorAvailable = false): ToolModeDecision {
  if (mode !== "ask") return ALLOWED;
  if (ASK_UNAVAILABLE_REMOTE_TOOL_IDS.has(toolId)) return {
    allowed: false,
    reason: `Ask mode cannot use ${toolId}: its current adapter may start Quicker or serve. A non-bootstrapping read port is required.`,
  };
  if (ASK_PROGRAM_GET_TOOL_IDS.has(toolId) && !readOnlyExecutorAvailable) return {
    allowed: false, reason: `Ask mode requires a read-only execution port for ${toolId}; workspace export is unavailable.`,
  };
  if (toolId === "workspace_program" && !readOnlyExecutorAvailable) return {
    allowed: false, reason: "Ask workspace reads require an explicit local-only execution port; automatic project export and repair are unavailable.",
  };
  if (askReadActions(toolId)?.size === 0) return {
    allowed: false,
    reason: toolId === "browser"
      ? "Browser is unavailable in Ask mode because the current adapter may start a runtime or create a session. Use Agent mode for browser actions."
      : `Ask mode only permits read operations for ${toolId}. Switch to Agent mode to make changes.`,
  };
  return ALLOWED;
}

/** Plan and execution use the same operation boundary, including explicit read-port availability. */
export function getToolModeOperationDecision(toolId: string, mode: ChatMode, input: unknown, readOnlyExecutorAvailable = false, constraint?: ToolOperationConstraint): ToolModeDecision {
  const availability = getToolModeAvailability(toolId, mode, readOnlyExecutorAvailable);
  if (!availability.allowed) return availability;
  const action = input && typeof input === "object" ? (input as Record<string, unknown>).action : undefined;
  if (constraint && (typeof action !== "string" || !constraint.allowedActions.includes(action))) return {
    allowed: false,
    reason: `Tool ${toolId} does not support ${typeof action === "string" ? action : "this operation"} in the current execution scope.`,
  };
  if (mode !== "ask") return availability;
  const allowedActions = askReadActions(toolId);
  if (!allowedActions) return ALLOWED;
  if (typeof action === "string" && allowedActions.has(action)) return ALLOWED;
  return {
    allowed: false,
    reason: toolId === "workspace_program" && action === "diagnostics"
      ? "Diagnostics are unavailable in Ask mode because the current adapter may start Quicker. Local program and file reads remain available."
      : `Ask mode only permits read operations for ${toolId}. Switch to Agent mode to make changes.`,
  };
}

/** Enforce the operation boundary of mixed read/write tools independently of the model. */
export function applyToolModeGuards<T extends ToolSet>(tools: T, mode: ChatMode, readOnlyExecutors: ReadOnlyToolExecutors = {}, options: ToolModeGuardOptions = {}): T {
  if (mode !== "ask" && !Object.keys(options.operationConstraints ?? {}).length) return tools;
  const guarded = { ...tools };
  const clientReadonlyTools = new Set(options.clientReadonlyTools ?? []);
  for (const [toolId, definition] of Object.entries(tools)) {
    const allowedActions = askReadActions(toolId);
    const toolDefinition = definition as Tool;
    const constraint = Object.hasOwn(options.operationConstraints ?? {}, toolId) ? options.operationConstraints?.[toolId] : undefined;
    const clientReadonly = clientReadonlyTools.has(toolId) && !toolDefinition.execute;
    const hasReadOnlyPort = typeof readOnlyExecutors[toolId] === "function" || clientReadonly;
    const availability = getToolModeAvailability(toolId, mode, hasReadOnlyPort);
    if (!availability.allowed) {
      (guarded as ToolSet)[toolId] = {
        ...toolDefinition,
        execute: (input) => formatLocalToolResult(
          { errorCode: "tool_mode_denied", toolId, mode, ...(allowedActions ? {
            action: input && typeof input === "object" ? (input as Record<string, unknown>).action ?? null : null,
          } : {}) }, false, availability.reason,
          { retryable: false },
        ),
      } as Tool;
      continue;
    }
    // The client schema and renderer operation decision enforce its action set.
    // Attaching execute here would replace the SDK's client callback with disk IO.
    if (clientReadonly) continue;
    if (mode === "ask" && ASK_PROGRAM_GET_TOOL_IDS.has(toolId)) {
      (guarded as ToolSet)[toolId] = {
        ...toolDefinition,
        execute: readOnlyExecutors[toolId],
      } as Tool;
      continue;
    }
    if ((!constraint && (mode !== "ask" || !allowedActions)) || !toolDefinition.execute) continue;
    const execute = mode === "ask" && toolId === "workspace_program" ? readOnlyExecutors[toolId]! : toolDefinition.execute;
    (guarded as ToolSet)[toolId] = {
      ...toolDefinition,
      execute: async (input, options) => {
        const action = input && typeof input === "object"
          ? (input as Record<string, unknown>).action
          : undefined;
        const decision = getToolModeOperationDecision(toolId, mode, input, hasReadOnlyPort, constraint);
        if (!decision.allowed) {
          return formatLocalToolResult(
            { errorCode: "tool_mode_denied", toolId, mode, action: action ?? null },
            false,
            decision.reason,
            { retryable: false },
          );
        }
        return execute(input, options);
      },
    } as Tool;
  }
  return guarded;
}
