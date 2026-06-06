/** Client-safe qkrpc subprogram tool helpers. */

export const QKRPC_SUBPROGRAM_QUERY_TOOL = "qkrpc_subprogram_query";
export const QKRPC_SUBPROGRAM_TOOL = "qkrpc_subprogram";
export const QKRPC_SUBPROGRAM_MANAGE_TOOL = "qkrpc_subprogram_manage";

export const QKRPC_SUBPROGRAM_TOOL_IDS = [
  QKRPC_SUBPROGRAM_QUERY_TOOL,
  QKRPC_SUBPROGRAM_TOOL,
  QKRPC_SUBPROGRAM_MANAGE_TOOL,
] as const;

const LEGACY_LIST_TOOLS = new Set([
  "qkrpc_subprogram_list",
  "qkrpc_subprogram_search",
]);

export function readQkrpcSubprogramAction(input: unknown): string | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const action = (input as Record<string, unknown>).action;
  return typeof action === "string" && action.trim() ? action.trim() : null;
}

export function isQkrpcSubprogramGetTool(
  toolName: string,
  input?: unknown,
): boolean {
  if (toolName === "qkrpc_subprogram_get") return true;
  if (toolName !== QKRPC_SUBPROGRAM_TOOL) return false;
  return readQkrpcSubprogramAction(input) === "get";
}

export function isQkrpcSubprogramCreateTool(
  toolName: string,
  input?: unknown,
): boolean {
  if (toolName === "qkrpc_subprogram_create") return true;
  if (toolName === QKRPC_SUBPROGRAM_MANAGE_TOOL) {
    return readQkrpcSubprogramAction(input) === "create";
  }
  if (toolName !== QKRPC_SUBPROGRAM_TOOL) return false;
  return readQkrpcSubprogramAction(input) === "create";
}

export function isQkrpcSubprogramPatchTool(
  toolName: string,
  input?: unknown,
): boolean {
  if (toolName === "qkrpc_subprogram_patch") return true;
  if (toolName !== QKRPC_SUBPROGRAM_TOOL) return false;
  return readQkrpcSubprogramAction(input) === "patch";
}

export function isSubprogramListTool(toolName: string, input?: unknown): boolean {
  if (LEGACY_LIST_TOOLS.has(toolName)) return true;
  if (toolName === QKRPC_SUBPROGRAM_QUERY_TOOL) return true;
  if (toolName !== QKRPC_SUBPROGRAM_TOOL) return false;
  const action = readQkrpcSubprogramAction(input);
  return action === "list" || action === "search";
}
