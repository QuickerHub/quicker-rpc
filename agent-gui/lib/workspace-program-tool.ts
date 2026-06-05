/** Client-safe workspace_program facade helpers (no Node fs imports). */

export const WORKSPACE_PROGRAM_TOOL = "workspace_program";

/** @deprecated Use workspace_program({ action: "diagnostics" }) */
export const WORKSPACE_PROGRAM_DIAGNOSTICS_TOOL = "workspace_program_diagnostics";

export const LEGACY_WORKSPACE_FILE_TOOLS = new Set([
  "workspace_action_file_read",
  "workspace_action_file_write",
  "workspace_action_file_edit",
  "workspace_action_file_info",
  "workspace_action_file_search",
]);

export const LEGACY_WORKSPACE_DATA_TOOLS = new Set([
  "workspace_action_read_data",
  "workspace_action_write_data",
  "workspace_action_edit_data",
]);

export const LEGACY_WORKSPACE_PATCH_TOOL = "workspace_program_patch";
export const LEGACY_WORKSPACE_PROJECTS_TOOL = "workspace_action_projects";

const FILE_ACTIONS = new Set([
  "file_read",
  "file_write",
  "file_edit",
  "file_info",
  "file_search",
]);

const DATA_ACTIONS = new Set(["read_data", "write_data", "edit_data"]);

export function readWorkspaceProgramAction(input: unknown): string | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const action = (input as Record<string, unknown>).action;
  return typeof action === "string" && action.trim() ? action.trim() : null;
}

export function isWorkspaceProgramTool(toolName: string): boolean {
  return (
    toolName === WORKSPACE_PROGRAM_TOOL
    || toolName === WORKSPACE_PROGRAM_DIAGNOSTICS_TOOL
    || toolName === LEGACY_WORKSPACE_PATCH_TOOL
    || toolName === LEGACY_WORKSPACE_PROJECTS_TOOL
    || LEGACY_WORKSPACE_FILE_TOOLS.has(toolName)
    || LEGACY_WORKSPACE_DATA_TOOLS.has(toolName)
  );
}

export function isWorkspaceFileTool(toolName: string, input?: unknown): boolean {
  if (LEGACY_WORKSPACE_FILE_TOOLS.has(toolName)) return true;
  if (toolName !== WORKSPACE_PROGRAM_TOOL) return false;
  const action = readWorkspaceProgramAction(input);
  return action != null && FILE_ACTIONS.has(action);
}

export function isActionProjectDataTool(
  toolName: string,
  input?: unknown,
): boolean {
  if (LEGACY_WORKSPACE_DATA_TOOLS.has(toolName)) return true;
  if (toolName !== WORKSPACE_PROGRAM_TOOL) return false;
  const action = readWorkspaceProgramAction(input);
  return action != null && DATA_ACTIONS.has(action);
}

export function isWorkspaceExplorerFileTool(
  toolName: string,
  input?: unknown,
): boolean {
  return isWorkspaceFileTool(toolName, input) || isActionProjectDataTool(toolName, input);
}

export function isActionProjectsTool(toolName: string, input?: unknown): boolean {
  if (toolName === LEGACY_WORKSPACE_PROJECTS_TOOL) return true;
  if (toolName !== WORKSPACE_PROGRAM_TOOL) return false;
  const action = readWorkspaceProgramAction(input);
  return action === "projects_list" || action === undefined;
}

export function isProgramDiagnosticsTool(
  toolName: string,
  input?: unknown,
): boolean {
  if (toolName === WORKSPACE_PROGRAM_DIAGNOSTICS_TOOL) return true;
  if (toolName !== WORKSPACE_PROGRAM_TOOL) return false;
  return readWorkspaceProgramAction(input) === "diagnostics";
}

const WORKSPACE_ACTION_BY_PROGRAM_ACTION: Record<string, string> = {
  file_read: "workspace_action_file_read",
  file_write: "workspace_action_file_write",
  file_edit: "workspace_action_file_edit",
  file_info: "workspace_action_file_info",
  file_search: "workspace_action_file_search",
  read_data: "workspace_action_read_data",
  write_data: "workspace_action_write_data",
  edit_data: "workspace_action_edit_data",
  projects_list: "workspace_action_projects",
  patch: "workspace_program_patch",
  diagnostics: "workspace_program_diagnostics",
};

/** Map workspace_program facade calls to legacy tool ids for UI routing. */
export function effectiveWorkspaceToolId(
  toolName: string,
  input?: unknown,
): string {
  if (toolName !== WORKSPACE_PROGRAM_TOOL) return toolName;
  const action = readWorkspaceProgramAction(input);
  if (!action) return toolName;
  return WORKSPACE_ACTION_BY_PROGRAM_ACTION[action] ?? toolName;
}

export function workspaceProgramToolDisplayName(
  toolName: string,
  input?: unknown,
): string | null {
  if (toolName === LEGACY_WORKSPACE_PROJECTS_TOOL) return "projects";
  if (toolName === LEGACY_WORKSPACE_PATCH_TOOL) return "patch";
  if (toolName === WORKSPACE_PROGRAM_DIAGNOSTICS_TOOL) return "diagnostics";
  if (toolName !== WORKSPACE_PROGRAM_TOOL) {
    if (toolName === "workspace_action_file_read") return "file-read";
    if (toolName === "workspace_action_file_write") return "file-write";
    if (toolName === "workspace_action_file_edit") return "file-edit";
    if (toolName === "workspace_action_file_info") return "file-info";
    if (toolName === "workspace_action_file_search") return "file-search";
    if (toolName === "workspace_action_read_data") return "read-data";
    if (toolName === "workspace_action_write_data") return "write-data";
    if (toolName === "workspace_action_edit_data") return "edit-data";
    return null;
  }
  const action = readWorkspaceProgramAction(input);
  if (!action) return null;
  return action.replace(/_/g, "-");
}
