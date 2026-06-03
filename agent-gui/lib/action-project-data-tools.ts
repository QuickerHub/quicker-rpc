/** Client-safe tool ids / labels (no Node fs imports). */

export const ACTION_PROJECT_DATA_TOOLS = new Set([
  "workspace_action_read_data",
  "workspace_action_write_data",
  "workspace_action_edit_data",
]);

export function isActionProjectDataTool(toolName: string): boolean {
  return ACTION_PROJECT_DATA_TOOLS.has(toolName);
}

export function isWorkspaceExplorerFileTool(toolName: string): boolean {
  return (
    toolName === "workspace_file_read"
    || toolName === "workspace_file_write"
    || toolName === "workspace_file_edit"
    || isActionProjectDataTool(toolName)
  );
}

export function actionProjectDataToolDisplayName(toolName: string): string | null {
  switch (toolName) {
    case "workspace_action_read_data":
      return "read-data";
    case "workspace_action_write_data":
      return "write-data";
    case "workspace_action_edit_data":
      return "edit-data";
    default:
      return null;
  }
}
