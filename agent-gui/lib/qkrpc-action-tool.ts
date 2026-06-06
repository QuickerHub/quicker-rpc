/** Client-safe qkrpc action tool helpers. */

export const QKRPC_ACTION_QUERY_TOOL = "qkrpc_action_query";
export const QKRPC_ACTION_TOOL = "qkrpc_action";
export const QKRPC_ACTION_MANAGE_TOOL = "qkrpc_action_manage";

export const QKRPC_ACTION_TOOL_IDS = [
  QKRPC_ACTION_QUERY_TOOL,
  QKRPC_ACTION_TOOL,
  QKRPC_ACTION_MANAGE_TOOL,
] as const;

const LEGACY_LIST_TOOLS = new Set(["qkrpc_action_list", "qkrpc_action_search"]);

export function readQkrpcAction(input: unknown): string | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const action = (input as Record<string, unknown>).action;
  return typeof action === "string" && action.trim() ? action.trim() : null;
}

export function isActionListTool(toolName: string, input?: unknown): boolean {
  if (LEGACY_LIST_TOOLS.has(toolName)) return true;
  if (toolName === QKRPC_ACTION_QUERY_TOOL) return true;
  if (toolName !== QKRPC_ACTION_TOOL) return false;
  const action = readQkrpcAction(input);
  return action === "list" || action === "search";
}

export function actionListSourceFromTool(
  toolName: string,
  _input?: unknown,
): "list" | "search" | null {
  if (toolName === "qkrpc_action_search") return "search";
  if (
    toolName === QKRPC_ACTION_QUERY_TOOL
    || toolName === "qkrpc_action_list"
    || toolName === QKRPC_ACTION_TOOL
  ) {
    const action = readQkrpcAction(_input);
    if (toolName === QKRPC_ACTION_TOOL && action === "search") return "search";
    return "list";
  }
  return null;
}

export function isQkrpcActionGetTool(toolName: string, input?: unknown): boolean {
  if (toolName === "qkrpc_action_get") return true;
  if (toolName !== QKRPC_ACTION_TOOL) return false;
  return readQkrpcAction(input) === "get";
}

export function isQkrpcActionCreateTool(toolName: string, input?: unknown): boolean {
  if (toolName === "qkrpc_action_create") return true;
  if (toolName === QKRPC_ACTION_MANAGE_TOOL) {
    return readQkrpcAction(input) === "create";
  }
  if (toolName !== QKRPC_ACTION_TOOL) return false;
  return readQkrpcAction(input) === "create";
}
