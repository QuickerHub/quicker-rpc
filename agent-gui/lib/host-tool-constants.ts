/** Cursor-style host tool ids (cwd files + shell). Not Quicker RPC domain tools. */

export const SHELL_TOOL = "Shell";
export const READ_TOOL = "Read";
export const WRITE_TOOL = "Write";
export const STR_REPLACE_TOOL = "StrReplace";
export const GREP_TOOL = "Grep";

/** Legacy host tool ids kept for chat replay and prefs migration. */
export const LEGACY_SHELL_EXEC_TOOL = "shell_exec";
export const LEGACY_WORKSPACE_FILE_TOOL = "workspace_file";

export const HOST_TOOL_IDS = [
  SHELL_TOOL,
  READ_TOOL,
  WRITE_TOOL,
  STR_REPLACE_TOOL,
  GREP_TOOL,
] as const;

export type HostToolId = (typeof HOST_TOOL_IDS)[number];

export function isShellToolName(toolName: string): boolean {
  return toolName === SHELL_TOOL || toolName === LEGACY_SHELL_EXEC_TOOL;
}

export function isReadToolName(toolName: string): boolean {
  return toolName === READ_TOOL;
}

export function isWriteToolName(toolName: string): boolean {
  return toolName === WRITE_TOOL;
}

export function isStrReplaceToolName(toolName: string): boolean {
  return toolName === STR_REPLACE_TOOL;
}

export function isGrepToolName(toolName: string): boolean {
  return toolName === GREP_TOOL;
}

export function isWorkspaceHostFileToolName(toolName: string): boolean {
  return (
    toolName === READ_TOOL
    || toolName === WRITE_TOOL
    || toolName === STR_REPLACE_TOOL
    || toolName === LEGACY_WORKSPACE_FILE_TOOL
  );
}
