/** Client-safe helpers for workspace_file (general cwd files, not Quicker program bodies). */

export const WORKSPACE_FILE_TOOL = "workspace_file";

const FILE_ACTIONS = new Set([
  "read",
  "write",
  "edit",
  "info",
  "search",
  "list",
]);

/** Map workspace_file actions to legacy UI tool ids (shared with workspace_program file_*). */
export const WORKSPACE_FILE_ACTION_TO_LEGACY: Record<string, string> = {
  read: "workspace_action_file_read",
  write: "workspace_action_file_write",
  edit: "workspace_action_file_edit",
  info: "workspace_action_file_info",
  search: "workspace_action_file_search",
  list: "workspace_file_list",
};

export function readWorkspaceFileToolAction(input: unknown): string | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const action = (input as Record<string, unknown>).action;
  return typeof action === "string" && action.trim() ? action.trim() : null;
}

export function isWorkspaceGeneralFileTool(
  toolName: string,
  input?: unknown,
): boolean {
  if (toolName !== WORKSPACE_FILE_TOOL) return false;
  const action = readWorkspaceFileToolAction(input);
  return action != null && FILE_ACTIONS.has(action);
}

export function effectiveGeneralWorkspaceFileToolId(
  toolName: string,
  input?: unknown,
): string | null {
  if (toolName !== WORKSPACE_FILE_TOOL) return null;
  const action = readWorkspaceFileToolAction(input);
  if (!action) return toolName;
  return WORKSPACE_FILE_ACTION_TO_LEGACY[action] ?? toolName;
}
