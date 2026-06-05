/** Client-safe qkrpc_subprogram facade helpers. */

export const QKRPC_SUBPROGRAM_TOOL = "qkrpc_subprogram";

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
