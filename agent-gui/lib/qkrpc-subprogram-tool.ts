/** Client-safe qkrpc subprogram tool helpers. */

export const QKRPC_SUBPROGRAM_QUERY_TOOL = "qkrpc_subprogram_query";
export const QKRPC_SUBPROGRAM_GET_TOOL = "qkrpc_subprogram_get";
export const QKRPC_SUBPROGRAM_EXPORT_TOOL = "qkrpc_subprogram_export";
export const QKRPC_SUBPROGRAM_IMPORT_TOOL = "qkrpc_subprogram_import";
export const QKRPC_SUBPROGRAM_EDIT_TOOL = "qkrpc_subprogram_edit";
/** @deprecated Hidden — use workspace_program; legacy replay only. */
export const QKRPC_SUBPROGRAM_EDIT_VAR_TOOL = "qkrpc_subprogram_edit_var";
export const QKRPC_SUBPROGRAM_CREATE_TOOL = "qkrpc_subprogram_create";

/** @deprecated Consolidated-era mega-tool id (legacy replay only). */
export const QKRPC_SUBPROGRAM_TOOL = "qkrpc_subprogram";
/** @deprecated Consolidated-era mega-tool id (legacy replay only). */
export const QKRPC_SUBPROGRAM_MANAGE_TOOL = "qkrpc_subprogram_manage";

export const QKRPC_SUBPROGRAM_TOOL_IDS = [
  QKRPC_SUBPROGRAM_QUERY_TOOL,
  QKRPC_SUBPROGRAM_GET_TOOL,
  QKRPC_SUBPROGRAM_EXPORT_TOOL,
  QKRPC_SUBPROGRAM_IMPORT_TOOL,
  QKRPC_SUBPROGRAM_EDIT_TOOL,
  QKRPC_SUBPROGRAM_CREATE_TOOL,
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
  if (toolName === QKRPC_SUBPROGRAM_GET_TOOL) return true;
  if (toolName !== QKRPC_SUBPROGRAM_TOOL) return false;
  return readQkrpcSubprogramAction(input) === "get";
}

export function isQkrpcSubprogramCreateTool(
  toolName: string,
  _input?: unknown,
): boolean {
  if (toolName === QKRPC_SUBPROGRAM_CREATE_TOOL || toolName === "qkrpc_subprogram_create") {
    return true;
  }
  if (toolName === QKRPC_SUBPROGRAM_MANAGE_TOOL) {
    return readQkrpcSubprogramAction(_input) === "create";
  }
  if (toolName !== QKRPC_SUBPROGRAM_TOOL) return false;
  return readQkrpcSubprogramAction(_input) === "create";
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
