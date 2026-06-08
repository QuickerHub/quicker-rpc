/** Human-facing tool titles in chat (tool-name row). */

export const WORKSPACE_PROGRAM_ACTION_LABELS: Record<string, string> = {
  read_data: "读取程序数据",
  write_data: "写入程序数据",
  edit_data: "编辑程序数据",
  file_read: "读取工作区文件",
  file_write: "写入工作区文件",
  file_edit: "编辑工作区文件",
  file_info: "查看文件信息",
  file_search: "搜索文件内容",
  patch: "保存程序修改",
  diagnostics: "检查程序语法",
  projects_list: "列出动作项目",
  file_list: "列出目录文件",
};

const LEGACY_WORKSPACE_TOOL_LABELS: Record<string, string> = {
  workspace_action_file_read: "读取工作区文件",
  workspace_action_file_write: "写入工作区文件",
  workspace_action_file_edit: "编辑工作区文件",
  workspace_action_file_info: "查看文件信息",
  workspace_action_file_search: "搜索文件内容",
  workspace_action_read_data: "读取程序数据",
  workspace_action_write_data: "写入程序数据",
  workspace_action_edit_data: "编辑程序数据",
  workspace_action_projects: "列出动作项目",
  workspace_program_patch: "保存程序修改",
  workspace_program_diagnostics: "检查程序语法",
};

export function workspaceProgramActionDisplayLabel(action: string): string | null {
  return WORKSPACE_PROGRAM_ACTION_LABELS[action] ?? null;
}

export function legacyWorkspaceToolDisplayLabel(toolName: string): string | null {
  return LEGACY_WORKSPACE_TOOL_LABELS[toolName] ?? null;
}
