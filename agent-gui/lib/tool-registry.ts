/** Tool metadata for UI selection and approval hints. */

export type ToolGroupId = "read" | "write" | "destructive";

/** Functional domain for tool picker sub-sections (within a permission group). */
export type ToolCategoryId =
  | "docs"
  | "workspace"
  | "action"
  | "subprogram"
  | "catalog"
  | "layout"
  | "runtime"
  | "settings"
  | "delete";

export type ToolMeta = {
  id: string;
  label: string;
  group: ToolGroupId;
  category: ToolCategoryId;
  /** Shown in tool picker; destructive tools always need approval when enabled. */
  description?: string;
};

export const TOOL_GROUP_LABELS: Record<ToolGroupId, string> = {
  read: "只读",
  write: "写入",
  destructive: "危险",
};

export const TOOL_CATEGORY_LABELS: Record<ToolCategoryId, string> = {
  docs: "编写指南",
  workspace: "工作区",
  action: "动作",
  subprogram: "子程序",
  catalog: "步骤与资源",
  layout: "动作页与布局",
  runtime: "运行",
  settings: "设置",
  delete: "删除",
};

/** Category order within each permission group in the tool picker. */
export const TOOL_CATEGORY_ORDER_BY_GROUP: Record<ToolGroupId, ToolCategoryId[]> = {
  read: ["docs", "workspace", "action", "subprogram", "catalog"],
  write: ["action", "subprogram", "workspace", "layout", "runtime", "settings"],
  destructive: ["delete"],
};

export const QKRPC_TOOL_REGISTRY: ToolMeta[] = [
  { id: "docs_get", label: "指南", group: "read", category: "docs", description: "本地 authoring 指南（按 topic）" },
  { id: "docs_get_reference", label: "指南附录", group: "read", category: "docs", description: "references/ 主题附录（若有）" },
  { id: "docs_search", label: "搜索指南", group: "read", category: "docs", description: "本地文档搜索" },
  { id: "docs_index", label: "指南索引", group: "read", category: "docs", description: "列出全部主题" },
  {
    id: "shell_exec",
    label: "终端",
    group: "write",
    category: "runtime",
    description: "在本机工作目录执行 PowerShell/cmd/bash 命令或脚本",
  },
  {
    id: "dev_frontend_check",
    label: "前端检查",
    group: "read",
    category: "runtime",
    description: "检测 agent-gui 本地 dev 页面/编译/浏览器报错（开发模式）",
  },
  {
    id: "llm_settings",
    label: "模型配置",
    group: "write",
    category: "settings",
    description: "管理自定义 LLM profile 与当前选用模型",
  },
  { id: "workspace_action_file_read", label: "读动作文件", group: "read", category: "workspace", description: "files/ 外置资源" },
  {
    id: "workspace_action_file_info",
    label: "动作文件信息",
    group: "read",
    category: "workspace",
    description: "files/ 大小与行数",
  },
  {
    id: "workspace_action_file_search",
    label: "搜索动作文件",
    group: "read",
    category: "workspace",
    description: "files/ 字面量搜索",
  },
  {
    id: "workspace_action_projects",
    label: "动作项目",
    group: "read",
    category: "workspace",
    description: "扫描 .quicker/actions 本地项目",
  },
  {
    id: "workspace_action_read_data",
    label: "读 data.json",
    group: "read",
    category: "workspace",
    description: "按动作 ID 读取 data.json（mode=summary 仅摘要）",
  },
  { id: "qkrpc_action_list", label: "列出动作", group: "read", category: "action" },
  { id: "qkrpc_action_search", label: "搜索动作", group: "read", category: "action" },
  { id: "qkrpc_action_get", label: "读取动作", group: "read", category: "action" },
  { id: "qkrpc_subprogram_list", label: "列出子程序", group: "read", category: "subprogram" },
  { id: "qkrpc_subprogram_search", label: "搜索子程序", group: "read", category: "subprogram" },
  { id: "qkrpc_subprogram_get", label: "读取子程序", group: "read", category: "subprogram" },
  { id: "qkrpc_step_runner_search", label: "搜索步骤模块", group: "read", category: "catalog" },
  { id: "qkrpc_step_runner_get", label: "步骤模块 schema", group: "read", category: "catalog" },
  { id: "qkrpc_fa_search", label: "搜索图标", group: "read", category: "catalog" },
  { id: "qkrpc_fa_resolve", label: "解析图标", group: "read", category: "catalog", description: "fa: → SVG path" },
  {
    id: "qkrpc_action_create",
    label: "创建动作",
    group: "write",
    category: "action",
    description: "新建虚拟页动作",
  },
  {
    id: "workspace_program_patch",
    label: "保存程序",
    group: "write",
    category: "workspace",
    description: "磁盘 data.json/files 写回 Quicker（action / 公共子程序 / 动作内子程序）",
  },
  {
    id: "workspace_program_diagnostics",
    label: "程序语法诊断",
    group: "read",
    category: "workspace",
    description: "读取 patch 后 qkrpc serve 异步生成的表达式/C# 语法检查结果",
  },
  {
    id: "qkrpc_action_patch",
    label: "保存动作",
    group: "write",
    category: "action",
    description: "保存动作 workspace（等同 workspace_program_patch target=action）",
  },
  {
    id: "qkrpc_action_set_metadata",
    label: "更新元数据",
    group: "write",
    category: "action",
    description: "标题/描述/图标",
  },
  {
    id: "workspace_action_write_data",
    label: "写 data.json",
    group: "write",
    category: "action",
    description: "按动作 ID 写入 data.json",
  },
  {
    id: "workspace_action_edit_data",
    label: "改 data.json",
    group: "write",
    category: "action",
    description: "按动作 ID 替换 data.json 片段",
  },
  {
    id: "qkrpc_action_publish",
    label: "分享/发布动作",
    group: "write",
    category: "action",
    description: "首次分享到 getquicker 或更新已分享动作",
  },
  {
    id: "qkrpc_action_update",
    label: "更新分享动作",
    group: "write",
    category: "action",
    description: "已分享动作更新（兼容别名，同 publish 后端）",
  },
  {
    id: "qkrpc_action_move",
    label: "移动动作",
    group: "write",
    category: "action",
    description: "移到其他动作页/格子",
  },
  {
    id: "qkrpc_action_float",
    label: "悬浮按钮",
    group: "write",
    category: "action",
    description: "显示动作悬浮按钮",
  },
  {
    id: "qkrpc_action_edit",
    label: "打开动作编辑器",
    group: "write",
    category: "action",
    description: "Quicker 设计器 UI",
  },
  {
    id: "qkrpc_action_edit_var",
    label: "编辑变量默认值",
    group: "write",
    category: "action",
    description: "无头修改变量默认值",
  },
  {
    id: "qkrpc_subprogram_create",
    label: "创建子程序",
    group: "write",
    category: "subprogram",
    description: "新建公共子程序并写入工作区 info.json",
  },
  {
    id: "qkrpc_subprogram_patch",
    label: "修补子程序",
    group: "write",
    category: "subprogram",
    description: "修改子程序步骤/变量",
  },
  {
    id: "qkrpc_subprogram_replace",
    label: "替换子程序",
    group: "write",
    category: "subprogram",
    description: "整体替换子程序",
  },
  {
    id: "qkrpc_subprogram_export",
    label: "导出子程序",
    group: "write",
    category: "subprogram",
    description: "导出 .quicker 项目",
  },
  {
    id: "qkrpc_subprogram_import",
    label: "导入子程序",
    group: "write",
    category: "subprogram",
    description: "从 .quicker 项目导入",
  },
  {
    id: "qkrpc_subprogram_edit",
    label: "打开子程序编辑器",
    group: "write",
    category: "subprogram",
    description: "Quicker 子程序 UI",
  },
  {
    id: "qkrpc_subprogram_edit_var",
    label: "编辑子程序变量",
    group: "write",
    category: "subprogram",
    description: "设计器 UI 修改变量",
  },
  {
    id: "workspace_action_file_write",
    label: "写动作外置文件",
    group: "write",
    category: "workspace",
    description: "写入动作 files/",
  },
  {
    id: "workspace_action_file_edit",
    label: "改动作外置文件",
    group: "write",
    category: "workspace",
    description: "改动作 files/",
  },
  {
    id: "qkrpc_profile_delete",
    label: "删除空白动作页",
    group: "write",
    category: "action",
    description: "删除无动作的动作页",
  },
  {
    id: "qkrpc_profile_create",
    label: "创建全局页",
    group: "write",
    category: "layout",
    description: "新建空白全局动作页",
  },
  {
    id: "qkrpc_profile_reorder",
    label: "调整全局页顺序",
    group: "write",
    category: "layout",
    description: "移到 _global 之后",
  },
  {
    id: "qkrpc_process_ensure",
    label: "虚拟进程/归集",
    group: "write",
    category: "layout",
    description: "创建虚拟进程动作页，可选按子程序引用批量移动作",
  },
  {
    id: "qkrpc_action_run",
    label: "运行动作",
    group: "write",
    category: "runtime",
    description: "执行本地动作",
  },
  {
    id: "qkrpc_action_delete",
    label: "删除动作",
    group: "destructive",
    category: "delete",
    description: "永久删除，需确认",
  },
  {
    id: "qkrpc_subprogram_delete",
    label: "删除子程序",
    group: "destructive",
    category: "delete",
    description: "永久删除，需确认",
  },
];

export function toolsInCategory(group: ToolGroupId, category: ToolCategoryId): ToolMeta[] {
  return QKRPC_TOOL_REGISTRY.filter((t) => t.group === group && t.category === category);
}

export const ALL_QKRPC_TOOL_IDS = QKRPC_TOOL_REGISTRY.map((t) => t.id);

const registryById = new Map(QKRPC_TOOL_REGISTRY.map((t) => [t.id, t]));

export function getToolMeta(id: string): ToolMeta | undefined {
  return registryById.get(id);
}

export function defaultEnabledToolIds(): string[] {
  return [...ALL_QKRPC_TOOL_IDS];
}

/** Tools that require in-chat Confirm/Cancel before execute. */
export const TOOLS_REQUIRING_APPROVAL = new Set([
  "qkrpc_action_delete",
  "qkrpc_subprogram_delete",
]);

export function toolNeedsApproval(toolId: string): boolean {
  return TOOLS_REQUIRING_APPROVAL.has(toolId);
}

export function pickEnabledTools<T extends Record<string, unknown>>(
  allTools: T,
  enabledIds: string[] | undefined,
): T {
  if (!enabledIds?.length) return allTools;
  const allowed = new Set(enabledIds);
  const picked = {} as T;
  for (const key of Object.keys(allTools)) {
    if (allowed.has(key)) {
      (picked as Record<string, unknown>)[key] = allTools[key];
    }
  }
  return picked;
}

/** User-enabled tools plus internal chat-only tools (hidden in UI). */
export function pickChatTools<T extends Record<string, unknown>>(
  allTools: T,
  enabledIds: string[] | undefined,
  alwaysOnIds: readonly string[],
): T {
  const picked = pickEnabledTools(allTools, enabledIds);
  const bag = picked as Record<string, unknown>;
  for (const id of alwaysOnIds) {
    if (id in allTools && !(id in bag)) {
      bag[id] = allTools[id];
    }
  }
  return picked;
}

export const TOOL_APPROVAL_STORAGE_KEY = "agent-gui-enabled-tools";

const LEGACY_TOOL_ID_MAP: Record<string, string> = {
  qkrpc_guide_get: "docs_get",
  qkrpc_guide_search: "docs_search",
  workspace_file_list: "workspace_action_projects",
};

type StoredToolPrefsV1 = {
  v: 1;
  enabled: string[];
  registryIds: string[];
};

function migrateStoredToolIds(ids: string[]): string[] {
  const mapped = ids.map((id) => LEGACY_TOOL_ID_MAP[id] ?? id);
  return [...new Set(mapped)];
}

function filterKnownToolIds(ids: string[]): string[] {
  return migrateStoredToolIds(ids).filter((id) => registryById.has(id));
}

/** Resolve enabled ids: new registry tools default on; explicit disables preserved. */
export function resolveEnabledToolsFromPrefs(
  enabledIds: string[],
  savedRegistryIds: string[],
): string[] {
  const enabledSet = new Set(filterKnownToolIds(enabledIds));
  const savedRegistry = new Set(filterKnownToolIds(savedRegistryIds));
  const resolved: string[] = [];

  for (const id of ALL_QKRPC_TOOL_IDS) {
    if (!savedRegistry.has(id)) {
      // Tool added after last save → default enabled
      resolved.push(id);
    } else if (enabledSet.has(id)) {
      resolved.push(id);
    }
  }

  return resolved.length > 0 ? resolved : defaultEnabledToolIds();
}

function readStoredToolPrefs(): StoredToolPrefsV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(TOOL_APPROVAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object"
      && parsed !== null
      && (parsed as StoredToolPrefsV1).v === 1
      && Array.isArray((parsed as StoredToolPrefsV1).enabled)
      && Array.isArray((parsed as StoredToolPrefsV1).registryIds)
    ) {
      return parsed as StoredToolPrefsV1;
    }
    return null;
  } catch {
    return null;
  }
}

function writeStoredToolPrefs(enabledIds: string[]): void {
  const enabled = ALL_QKRPC_TOOL_IDS.filter((id) => enabledIds.includes(id));
  const payload: StoredToolPrefsV1 = {
    v: 1,
    enabled,
    registryIds: [...ALL_QKRPC_TOOL_IDS],
  };
  localStorage.setItem(TOOL_APPROVAL_STORAGE_KEY, JSON.stringify(payload));
}

/** Legacy allowlist: union missing registry tools (default on) then persist v1. */
function migrateLegacyEnabledArray(stored: string[]): string[] {
  const enabled = filterKnownToolIds(stored);
  if (enabled.length === 0) return defaultEnabledToolIds();

  const enabledSet = new Set(enabled);
  for (const id of ALL_QKRPC_TOOL_IDS) {
    enabledSet.add(id);
  }
  const resolved = ALL_QKRPC_TOOL_IDS.filter((id) => enabledSet.has(id));
  writeStoredToolPrefs(resolved);
  return resolved;
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

function registrySnapshotMatchesCurrent(savedRegistryIds: string[]): boolean {
  return (
    savedRegistryIds.length === ALL_QKRPC_TOOL_IDS.length
    && ALL_QKRPC_TOOL_IDS.every((id, i) => savedRegistryIds[i] === id)
  );
}

export function loadStoredEnabledTools(): string[] {
  if (typeof window === "undefined") return defaultEnabledToolIds();
  try {
    const v1 = readStoredToolPrefs();
    if (v1) {
      const resolved = resolveEnabledToolsFromPrefs(v1.enabled, v1.registryIds);
      if (
        !registrySnapshotMatchesCurrent(v1.registryIds)
        || !sameIdSet(resolved, v1.enabled)
      ) {
        writeStoredToolPrefs(resolved);
      }
      return resolved;
    }

    const raw = localStorage.getItem(TOOL_APPROVAL_STORAGE_KEY);
    if (!raw) return defaultEnabledToolIds();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaultEnabledToolIds();
    const ids = parsed.filter((x): x is string => typeof x === "string");
    return migrateLegacyEnabledArray(ids);
  } catch {
    return defaultEnabledToolIds();
  }
}

export function storeEnabledTools(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    writeStoredToolPrefs(ids);
  } catch {
    /* ignore */
  }
}
