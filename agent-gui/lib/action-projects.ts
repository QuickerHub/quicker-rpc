import { isStructuredToolResult } from "@/lib/tool-result";

export const WORKSPACE_ACTION_PROJECTS_TOOL = "workspace_action_projects";

export type ActionProjectRow = {
  dirName: string;
  path: string;
  title?: string;
  actionId?: string;
};

export type ParsedActionProjects = {
  root: string;
  projects: ActionProjectRow[];
};

export function isActionProjectsTool(toolName: string): boolean {
  return toolName === WORKSPACE_ACTION_PROJECTS_TOOL;
}

export function actionProjectsToolDisplayName(toolName: string): string | null {
  return isActionProjectsTool(toolName) ? "projects" : null;
}

export function parseActionProjectsFromToolData(
  data: unknown,
): ParsedActionProjects | null {
  if (typeof data !== "object" || data === null) return null;
  const obj = data as Record<string, unknown>;
  if (obj.success === false) return null;
  const action = obj.action;
  if (typeof action === "string" && action !== "action-projects") return null;

  const root = readString(obj, "root", "Root");
  const projectsRaw = obj.projects ?? obj.Projects;
  if (!Array.isArray(projectsRaw)) return null;

  const projects: ActionProjectRow[] = [];
  for (const item of projectsRaw) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const dirName = readString(o, "dirName", "DirName");
    const path = readString(o, "path", "Path");
    if (!dirName || !path) continue;
    projects.push({
      dirName,
      path,
      title: readString(o, "title", "Title"),
      actionId: readString(o, "actionId", "ActionId", "id", "Id"),
    });
  }

  return {
    root: root ?? ".quicker/actions",
    projects,
  };
}

function readString(
  obj: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}

export function formatActionProjectsMetaLine(parsed: ParsedActionProjects): string {
  const n = parsed.projects.length;
  if (n === 0) return "无本地动作项目";
  return `${n} 个动作项目`;
}

export function parseActionIdFromSyncedToolOutput(
  output: unknown,
): string | undefined {
  if (!isStructuredToolResult(output) || !output.ok) return undefined;
  const data = output.data;
  if (typeof data !== "object" || data === null) return undefined;
  const obj = data as Record<string, unknown>;
  const actionId = readString(obj, "actionId", "ActionId");
  if (actionId) return actionId;
  return readString(obj, "id", "Id");
}

export function shouldRefreshExplorerAfterTool(
  toolName: string,
  output: unknown,
): boolean {
  if (!isStructuredToolResult(output) || !output.ok) return false;
  if (isActionProjectsTool(toolName)) return true;

  if (
    toolName === "qkrpc_action_get"
    || toolName === "qkrpc_action_create"
    || toolName === "qkrpc_action_patch"
  ) {
    const data = output.data;
    if (typeof data === "object" && data !== null) {
      return (data as Record<string, unknown>).workspaceSynced === true;
    }
  }

  const fileTools = new Set([
    "workspace_action_file_read",
    "workspace_action_file_write",
    "workspace_action_file_edit",
    "workspace_action_read_data",
    "workspace_action_write_data",
    "workspace_action_edit_data",
  ]);
  return fileTools.has(toolName);
}
