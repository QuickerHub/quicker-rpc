/** Tool metadata for UI selection and approval hints. */

export type ToolGroupId = "read" | "write" | "destructive";

export type ToolMeta = {
  id: string;
  label: string;
  group: ToolGroupId;
  /** Shown in tool picker; destructive tools always need approval when enabled. */
  description?: string;
};

export const TOOL_GROUP_LABELS: Record<ToolGroupId, string> = {
  read: "只读",
  write: "写入",
  destructive: "危险",
};

export const QKRPC_TOOL_REGISTRY: ToolMeta[] = [
  { id: "docs_get", label: "指南", group: "read", description: "本地 Agent Skills 指南" },
  { id: "docs_get_reference", label: "指南附录", group: "read", description: "Skill references/ 大表" },
  { id: "docs_search", label: "搜索指南", group: "read", description: "本地文档搜索" },
  { id: "docs_index", label: "指南索引", group: "read", description: "列出全部主题" },
  { id: "workspace_file_read", label: "读文件", group: "read", description: "工作目录内 UTF-8 文件" },
  {
    id: "workspace_action_projects",
    label: "动作项目",
    group: "read",
    description: "扫描 .quicker/actions 本地项目",
  },
  {
    id: "workspace_action_read_data",
    label: "读 data.json",
    group: "read",
    description: "按动作 ID 读取 data.json（mode=summary 仅摘要）",
  },
  { id: "qkrpc_action_list", label: "列出动作", group: "read" },
  { id: "qkrpc_action_search", label: "搜索动作", group: "read" },
  { id: "qkrpc_action_get", label: "读取动作", group: "read" },
  {
    id: "qkrpc_action_validate",
    label: "校验动作项目",
    group: "read",
    description: "校验 data.json 与外置 file，返回步/变量摘要",
  },
  { id: "qkrpc_subprogram_list", label: "列出子程序", group: "read" },
  { id: "qkrpc_subprogram_search", label: "搜索子程序", group: "read" },
  { id: "qkrpc_subprogram_get", label: "读取子程序", group: "read" },
  { id: "qkrpc_step_runner_search", label: "搜索步骤模块", group: "read" },
  { id: "qkrpc_step_runner_get", label: "步骤模块 schema", group: "read" },
  { id: "qkrpc_fa_search", label: "搜索图标", group: "read" },
  { id: "qkrpc_fa_resolve", label: "解析图标", group: "read", description: "fa: → SVG path" },
  {
    id: "qkrpc_action_create",
    label: "创建动作",
    group: "write",
    description: "新建虚拟页动作",
  },
  {
    id: "qkrpc_action_patch",
    label: "保存动作",
    group: "write",
    description: "从工作区 .quicker 项目写回 Quicker",
  },
  {
    id: "qkrpc_action_set_metadata",
    label: "更新元数据",
    group: "write",
    description: "标题/描述/图标",
  },
  {
    id: "workspace_action_write_data",
    label: "写 data.json",
    group: "write",
    description: "按动作 ID 写入 data.json",
  },
  {
    id: "workspace_action_edit_data",
    label: "改 data.json",
    group: "write",
    description: "按动作 ID 替换 data.json 片段",
  },
  {
    id: "workspace_file_write",
    label: "写文件",
    group: "write",
    description: "按相对路径写文件（脚本等）",
  },
  {
    id: "workspace_file_edit",
    label: "改文件",
    group: "write",
    description: "工作目录内 search/replace 编辑",
  },
  {
    id: "qkrpc_action_update",
    label: "发布分享动作",
    group: "write",
    description: "上传/更新分享动作",
  },
  {
    id: "qkrpc_action_run",
    label: "运行动作",
    group: "write",
    description: "执行本地动作",
  },
  {
    id: "qkrpc_action_float",
    label: "悬浮按钮",
    group: "write",
    description: "显示动作悬浮按钮",
  },
  {
    id: "qkrpc_action_edit",
    label: "打开动作编辑器",
    group: "write",
    description: "Quicker 设计器 UI",
  },
  {
    id: "qkrpc_action_edit_var",
    label: "编辑变量默认值",
    group: "write",
    description: "设计器 UI 修改变量",
  },
  {
    id: "qkrpc_subprogram_create",
    label: "创建子程序",
    group: "write",
    description: "新建公共子程序",
  },
  {
    id: "qkrpc_subprogram_patch",
    label: "修补子程序",
    group: "write",
    description: "修改子程序步骤/变量",
  },
  {
    id: "qkrpc_subprogram_replace",
    label: "替换子程序",
    group: "write",
    description: "整体替换子程序",
  },
  {
    id: "qkrpc_subprogram_export",
    label: "导出子程序",
    group: "write",
    description: "导出 .quicker 项目",
  },
  {
    id: "qkrpc_subprogram_import",
    label: "导入子程序",
    group: "write",
    description: "从 .quicker 项目导入",
  },
  {
    id: "qkrpc_subprogram_edit",
    label: "打开子程序编辑器",
    group: "write",
    description: "Quicker 子程序 UI",
  },
  {
    id: "qkrpc_subprogram_edit_var",
    label: "编辑子程序变量",
    group: "write",
    description: "设计器 UI 修改变量",
  },
  {
    id: "qkrpc_action_delete",
    label: "删除动作",
    group: "destructive",
    description: "永久删除，需确认",
  },
  {
    id: "qkrpc_subprogram_delete",
    label: "删除子程序",
    group: "destructive",
    description: "永久删除，需确认",
  },
];

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
