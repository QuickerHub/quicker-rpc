/** Tool metadata for UI selection and approval hints. */

import {
  LAUNCHER_TOOL_IDS,
  defaultLauncherToolIds,
} from "@/lib/chat-mode";

export {
  defaultLauncherToolIds,
  LAUNCHER_TOOL_IDS,
} from "@/lib/chat-mode";

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
  { id: "docs", label: "编写指南", group: "read", category: "docs", description: "本地 authoring 指南（get/search/index）" },
  {
    id: "shell_exec",
    label: "终端",
    group: "write",
    category: "runtime",
    description: "在本机工作目录执行 PowerShell/cmd/bash 命令或脚本",
  },
  {
    id: "browser",
    label: "浏览器",
    group: "write",
    category: "runtime",
    description: "Playwright 操控本地浏览器：navigate/snapshot/click/type/fill 等",
  },
  {
    id: "dev_frontend_check",
    label: "前端检查",
    group: "read",
    category: "runtime",
    description: "检测 agent-gui 本地 dev 页面/编译/浏览器报错（开发模式）",
  },
  {
    id: "ask_question",
    label: "询问选项",
    group: "read",
    category: "runtime",
    description: "在聊天中展示选择题并等待用户点选（可多选）",
  },
  {
    id: "llm_settings",
    label: "模型配置",
    group: "write",
    category: "settings",
    description: "管理自定义 LLM profile 与当前选用模型",
  },
  {
    id: "workspace_program",
    label: "工作区程序",
    group: "read",
    category: "workspace",
    description: "projects/data.json/files 读写、patch 保存、语法诊断",
  },
  {
    id: "qkrpc_action_query",
    label: "搜索动作",
    group: "read",
    category: "action",
    description: "list/query：关键词、JSON filter/sort、uses: 子程序引用",
  },
  {
    id: "qkrpc_action",
    label: "动作操作",
    group: "write",
    category: "action",
    description: "get/run/float/edit/元数据/移动/发布/replace",
  },
  {
    id: "qkrpc_action_manage",
    label: "动作与布局",
    group: "write",
    category: "layout",
    description: "create、动作页 profile_*、虚拟进程 process_ensure",
  },
  {
    id: "qkrpc_subprogram_query",
    label: "搜索子程序",
    group: "read",
    category: "subprogram",
    description: "list/query 公共子程序",
  },
  {
    id: "qkrpc_subprogram",
    label: "子程序操作",
    group: "write",
    category: "subprogram",
    description: "get/patch/replace/export/import/edit/edit_var",
  },
  {
    id: "qkrpc_subprogram_manage",
    label: "创建子程序",
    group: "write",
    category: "subprogram",
    description: "create（bootstrap 工作区项目）",
  },
  { id: "qkrpc_step_runner_search", label: "搜索步骤模块", group: "read", category: "catalog" },
  { id: "qkrpc_step_runner_get", label: "步骤模块 schema", group: "read", category: "catalog" },
  { id: "qkrpc_fa", label: "图标", group: "read", category: "catalog", description: "搜索/解析 Font Awesome fa: 规格" },
  {
    id: "launcher_resolve",
    label: "启动器解析",
    group: "read",
    category: "settings",
    description: "统一搜索设置/动作/子程序，打分排序，供启动器 Agent 决策",
  },
  {
    id: "quicker_settings",
    label: "Quicker 设置与界面",
    group: "write",
    category: "settings",
    description: "搜索/读/写设置；打开设置页、回收站、搜索框等",
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

const CONSOLIDATED_ACTION_TOOL_IDS = [
  "qkrpc_action_query",
  "qkrpc_action",
  "qkrpc_action_manage",
] as const;

const CONSOLIDATED_SUBPROGRAM_TOOL_IDS = [
  "qkrpc_subprogram_query",
  "qkrpc_subprogram",
  "qkrpc_subprogram_manage",
] as const;

const LEGACY_TOOL_ID_MAP: Record<string, string> = {
  qkrpc_guide_get: "docs",
  qkrpc_guide_search: "docs",
  docs_get: "docs",
  docs_get_reference: "docs",
  docs_search: "docs",
  docs_index: "docs",
  qkrpc_settings_search: "quicker_settings",
  qkrpc_settings_list: "quicker_settings",
  qkrpc_settings_get: "quicker_settings",
  qkrpc_settings_set: "quicker_settings",
  qkrpc_settings_pages: "quicker_settings",
  qkrpc_settings_open: "quicker_settings",
  qkrpc_fa_search: "qkrpc_fa",
  qkrpc_fa_resolve: "qkrpc_fa",
  qkrpc_action_list: "qkrpc_action_query",
  qkrpc_action_search: "qkrpc_action_query",
  qkrpc_action_get: "qkrpc_action",
  qkrpc_action_create: "qkrpc_action_manage",
  qkrpc_action_replace: "qkrpc_action",
  qkrpc_action_publish: "qkrpc_action",
  qkrpc_action_set_metadata: "qkrpc_action",
  qkrpc_action_float: "qkrpc_action",
  qkrpc_action_edit: "qkrpc_action",
  qkrpc_action_edit_var: "qkrpc_action",
  qkrpc_action_run: "qkrpc_action",
  qkrpc_action_move: "qkrpc_action",
  qkrpc_profile_create: "qkrpc_action_manage",
  qkrpc_profile_delete: "qkrpc_action_manage",
  qkrpc_profile_reorder: "qkrpc_action_manage",
  qkrpc_process_ensure: "qkrpc_action_manage",
  qkrpc_action_patch: "workspace_program",
  qkrpc_action_update: "qkrpc_action",
  qkrpc_subprogram_list: "qkrpc_subprogram_query",
  qkrpc_subprogram_search: "qkrpc_subprogram_query",
  qkrpc_subprogram_get: "qkrpc_subprogram",
  qkrpc_subprogram_create: "qkrpc_subprogram_manage",
  qkrpc_subprogram_patch: "qkrpc_subprogram",
  qkrpc_subprogram_replace: "qkrpc_subprogram",
  qkrpc_subprogram_export: "qkrpc_subprogram",
  qkrpc_subprogram_import: "qkrpc_subprogram",
  qkrpc_subprogram_edit: "qkrpc_subprogram",
  qkrpc_subprogram_edit_var: "qkrpc_subprogram",
  workspace_action_projects: "workspace_program",
  workspace_action_read_data: "workspace_program",
  workspace_action_write_data: "workspace_program",
  workspace_action_edit_data: "workspace_program",
  workspace_action_file_read: "workspace_program",
  workspace_action_file_write: "workspace_program",
  workspace_action_file_edit: "workspace_program",
  workspace_action_file_info: "workspace_program",
  workspace_action_file_search: "workspace_program",
  workspace_program_patch: "workspace_program",
  workspace_program_diagnostics: "workspace_program",
  workspace_file_list: "workspace_program",
};

type StoredToolPrefsV1 = {
  v: 1;
  enabled: string[];
  registryIds: string[];
};

function expandConsolidatedToolIds(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (id === "qkrpc_action") {
      out.push(...CONSOLIDATED_ACTION_TOOL_IDS);
      continue;
    }
    if (id === "qkrpc_subprogram") {
      out.push(...CONSOLIDATED_SUBPROGRAM_TOOL_IDS);
      continue;
    }
    out.push(LEGACY_TOOL_ID_MAP[id] ?? id);
  }
  return [...new Set(out)];
}

function migrateStoredToolIds(ids: string[]): string[] {
  return expandConsolidatedToolIds(ids);
}

function filterKnownToolIds(ids: string[]): string[] {
  return migrateStoredToolIds(ids).filter((id) => registryById.has(id));
}

function expandLegacyConsolidatedPrefs(
  ids: string[],
  savedRegistryIds: string[],
): string[] {
  const set = new Set(migrateStoredToolIds(ids));
  if (savedRegistryIds.includes("qkrpc_action") && ids.includes("qkrpc_action")) {
    for (const id of CONSOLIDATED_ACTION_TOOL_IDS) {
      set.add(id);
    }
  }
  if (
    savedRegistryIds.includes("qkrpc_subprogram")
    && ids.includes("qkrpc_subprogram")
  ) {
    for (const id of CONSOLIDATED_SUBPROGRAM_TOOL_IDS) {
      set.add(id);
    }
  }
  return [...set];
}

function normalizeSavedRegistryIds(ids: string[]): string[] {
  let expanded = [...ids];
  if (ids.includes("qkrpc_action")) {
    expanded = expanded.filter((id) => id !== "qkrpc_action");
    expanded.push(...CONSOLIDATED_ACTION_TOOL_IDS);
  }
  if (ids.includes("qkrpc_subprogram")) {
    expanded = expanded.filter((id) => id !== "qkrpc_subprogram");
    expanded.push(...CONSOLIDATED_SUBPROGRAM_TOOL_IDS);
  }
  return filterKnownToolIds(expanded);
}

/** Resolve enabled ids: new registry tools default on; explicit disables preserved. */
export function resolveEnabledToolsFromPrefs(
  enabledIds: string[],
  savedRegistryIds: string[],
): string[] {
  const enabledSet = new Set(
    filterKnownToolIds(expandLegacyConsolidatedPrefs(enabledIds, savedRegistryIds)),
  );
  const savedRegistry = new Set(normalizeSavedRegistryIds(savedRegistryIds));
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
