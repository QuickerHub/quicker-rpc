/** Client-safe tool ids / labels (no Node fs imports). */

import { workspaceProgramActionDisplayLabel } from "@/lib/chat-tool-display";

export {
  isActionProjectDataTool,
  isWorkspaceExplorerFileTool,
} from "@/lib/workspace-program-tool";

export function actionProjectDataToolDisplayName(
  toolName: string,
  input?: unknown,
): string | null {
  if (toolName === "workspace_action_read_data") {
    return workspaceProgramActionDisplayLabel("read_data");
  }
  if (toolName === "workspace_action_write_data") {
    return workspaceProgramActionDisplayLabel("write_data");
  }
  if (toolName === "workspace_action_edit_data") {
    return workspaceProgramActionDisplayLabel("edit_data");
  }
  if (toolName !== "workspace_program") return null;
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const action = (input as Record<string, unknown>).action;
  if (typeof action !== "string") return null;
  return workspaceProgramActionDisplayLabel(action);
}
