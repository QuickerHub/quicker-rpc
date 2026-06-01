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
  { id: "docs_get", label: "指南", group: "read", description: "本地 docs/action-authoring" },
  { id: "docs_search", label: "搜索指南", group: "read", description: "本地文档搜索" },
  { id: "docs_index", label: "指南索引", group: "read", description: "列出全部主题" },
  { id: "qkrpc_action_list", label: "列出动作", group: "read" },
  { id: "qkrpc_action_search", label: "搜索动作", group: "read" },
  { id: "qkrpc_action_get", label: "读取动作", group: "read" },
  { id: "qkrpc_subprogram_search", label: "搜索子程序", group: "read" },
  { id: "qkrpc_subprogram_get", label: "读取子程序", group: "read" },
  { id: "qkrpc_step_runner_search", label: "搜索步骤模块", group: "read" },
  { id: "qkrpc_step_runner_get", label: "步骤模块 schema", group: "read" },
  { id: "qkrpc_fa_search", label: "搜索图标", group: "read" },
  {
    id: "qkrpc_action_create",
    label: "创建动作",
    group: "write",
    description: "新建虚拟页动作",
  },
  {
    id: "qkrpc_action_patch",
    label: "修补动作",
    group: "write",
    description: "修改步骤/变量",
  },
  {
    id: "qkrpc_action_set_metadata",
    label: "更新元数据",
    group: "write",
    description: "标题/描述/图标",
  },
  {
    id: "qkrpc_action_run",
    label: "运行动作",
    group: "write",
    description: "执行本地动作",
  },
  {
    id: "qkrpc_action_delete",
    label: "删除动作",
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
export const TOOLS_REQUIRING_APPROVAL = new Set(["qkrpc_action_delete"]);

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
};

function migrateStoredToolIds(ids: string[]): string[] {
  const mapped = ids.map((id) => LEGACY_TOOL_ID_MAP[id] ?? id);
  return [...new Set(mapped)];
}

export function loadStoredEnabledTools(): string[] {
  if (typeof window === "undefined") return defaultEnabledToolIds();
  try {
    const raw = localStorage.getItem(TOOL_APPROVAL_STORAGE_KEY);
    if (!raw) return defaultEnabledToolIds();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaultEnabledToolIds();
    const ids = parsed.filter((x): x is string => typeof x === "string");
    const migrated = migrateStoredToolIds(ids);
    const valid = migrated.filter((id) => registryById.has(id));
    return valid.length > 0 ? valid : defaultEnabledToolIds();
  } catch {
    return defaultEnabledToolIds();
  }
}

export function storeEnabledTools(ids: string[]): void {
  try {
    localStorage.setItem(TOOL_APPROVAL_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}
