/** Client-safe helpers for Read/Write/StrReplace host file tools (not Quicker program bodies). */

import {
  LEGACY_WORKSPACE_FILE_TOOL,
  READ_TOOL,
  STR_REPLACE_TOOL,
  WRITE_TOOL,
} from "@/lib/host-tool-constants";

export {
  LEGACY_WORKSPACE_FILE_TOOL as WORKSPACE_FILE_TOOL,
  READ_TOOL,
  STR_REPLACE_TOOL,
  WRITE_TOOL,
} from "@/lib/host-tool-constants";

const READ_ACTIONS = new Set(["read", "info", "search", "list"]);
const WRITE_ACTIONS = new Set(["write"]);
const EDIT_ACTIONS = new Set(["edit"]);
const FILE_ACTIONS = new Set([...READ_ACTIONS, ...WRITE_ACTIONS, ...EDIT_ACTIONS]);

/** Map file tool actions to legacy UI tool ids (shared with workspace_program file_*). */
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

function resolveGeneralFileAction(
  toolName: string,
  input?: unknown,
): string | null {
  if (toolName === READ_TOOL) {
    const action = readWorkspaceFileToolAction(input);
    if (action && READ_ACTIONS.has(action)) return action;
    return "read";
  }
  if (toolName === WRITE_TOOL) {
    const action = readWorkspaceFileToolAction(input);
    if (action && WRITE_ACTIONS.has(action)) return action;
    return "write";
  }
  if (toolName === STR_REPLACE_TOOL) {
    return "edit";
  }
  if (toolName === LEGACY_WORKSPACE_FILE_TOOL) {
    const action = readWorkspaceFileToolAction(input);
    return action && FILE_ACTIONS.has(action) ? action : null;
  }
  return null;
}

export function isWorkspaceGeneralFileTool(
  toolName: string,
  input?: unknown,
): boolean {
  return resolveGeneralFileAction(toolName, input) != null;
}

export function effectiveGeneralWorkspaceFileToolId(
  toolName: string,
  input?: unknown,
): string | null {
  const action = resolveGeneralFileAction(toolName, input);
  if (!action) return null;
  if (toolName === LEGACY_WORKSPACE_FILE_TOOL) {
    return WORKSPACE_FILE_ACTION_TO_LEGACY[action] ?? toolName;
  }
  return WORKSPACE_FILE_ACTION_TO_LEGACY[action] ?? toolName;
}
