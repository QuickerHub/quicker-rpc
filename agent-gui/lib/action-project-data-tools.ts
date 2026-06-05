/** Client-safe tool ids / labels (no Node fs imports). */

export {
  isActionProjectDataTool,
  isWorkspaceExplorerFileTool,
} from "@/lib/workspace-program-tool";

export function actionProjectDataToolDisplayName(
  toolName: string,
  input?: unknown,
): string | null {
  if (toolName === "workspace_action_read_data") return "read-data";
  if (toolName === "workspace_action_write_data") return "write-data";
  if (toolName === "workspace_action_edit_data") return "edit-data";
  if (toolName !== "workspace_program") return null;
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const action = (input as Record<string, unknown>).action;
  if (action === "read_data") return "read-data";
  if (action === "write_data") return "write-data";
  if (action === "edit_data") return "edit-data";
  return null;
}
