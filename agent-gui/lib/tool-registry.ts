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
  read: ["docs", "workspace", "action", "subprogram", "catalog", "runtime", "settings"],
  write: ["action", "subprogram", "workspace", "layout", "runtime", "settings"],
  destructive: ["delete"],
};

export const QKRPC_TOOL_REGISTRY: ToolMeta[] = [
  {
    id: "docs",
    label: "编写指南",
    group: "read",
    category: "docs",
    description: "编写指南：search→snippet（主）；get→全文工作流；index→目录",
  },
  {
    id: "shell_exec",
    label: "终端",
    group: "write",
    category: "runtime",
    description: "工作目录执行命令/脚本（build/test/git、rg 搜索）；非普通文件读写（用 workspace_file）",
  },
  {
    id: "browser",
    label: "浏览器",
    group: "write",
    category: "runtime",
    description: "内置浏览器：侧栏打开页面（navigate）；自动化 snapshot/click 暂不可用；登录态持久",
  },
  {
    id: "web_search",
    label: "网络搜索",
    group: "read",
    category: "runtime",
    description: "搜索互联网：返回标题/链接/摘要（默认 DuckDuckGo，可配 Brave/Tavily API Key）",
  },
  {
    id: "dev_frontend_check",
    label: "前端检查",
    group: "read",
    category: "runtime",
    description: "检测 agent-gui 本地 dev 页面/编译/浏览器报错（开发模式）",
  },
  {
    id: "qkrpc_wait",
    label: "等待 Quicker 连接",
    group: "read",
    category: "runtime",
    description: "轮询直到 QuickerRpc 可用；自动重启 serve、quicker:runaction 拉起插件；connectivity_failure 时用",
  },
  {
    id: "ask_question",
    label: "询问选项",
    group: "read",
    category: "runtime",
    description: "在聊天中展示选择题并等待用户点选（可多选）",
  },
  {
    id: "task",
    label: "子代理",
    group: "write",
    category: "runtime",
    description: "委派任务给 .quicker/agents 定义的子代理（隔离上下文）",
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
    label: "编辑工作区程序",
    group: "read",
    category: "workspace",
    description: "编辑 .quicker 程序体：data.json/files → patch；改动在侧栏已改动可见",
  },
  {
    id: "workspace_file",
    label: "工作区文件",
    group: "read",
    category: "workspace",
    description: "读写 cwd 普通文件（.local 草稿、配置、脚本）；非 .quicker 程序体",
  },
  {
    id: "qkrpc_action_query",
    label: "搜索动作",
    group: "read",
    category: "action",
    description: "list/query：关键词、JSON filter/sort、uses: 子程序引用",
  },
  {
    id: "qkrpc_action_get",
    label: "同步动作",
    group: "write",
    category: "action",
    description: "get：首次同步到 .quicker 工作区",
  },
  {
    id: "qkrpc_action_edit",
    label: "打开动作设计器",
    group: "write",
    category: "action",
    description: "在 Quicker 桌面打开动作设计器",
  },
  {
    id: "qkrpc_action_edit_var",
    label: "改变量",
    group: "write",
    category: "action",
    description: "修改动作单个变量值",
  },
  {
    id: "qkrpc_action_set_metadata",
    label: "改元数据",
    group: "write",
    category: "action",
    description: "标题、描述、图标",
  },
  {
    id: "qkrpc_action_move",
    label: "移动动作",
    group: "write",
    category: "action",
    description: "在动作页网格上移动",
  },
  {
    id: "qkrpc_action_publish",
    label: "分享动作",
    group: "write",
    category: "action",
    description: "发布到 getquicker",
  },
  {
    id: "qkrpc_action_run",
    label: "运行动作",
    group: "write",
    category: "runtime",
    description: "执行动作并等待完成",
  },
  {
    id: "qkrpc_action_debug",
    label: "调试动作",
    group: "write",
    category: "runtime",
    description: "逐步调试，侧栏输出",
  },
  {
    id: "qkrpc_action_float",
    label: "悬浮动作",
    group: "write",
    category: "runtime",
    description: "弹出悬浮窗运行",
  },
  {
    id: "qkrpc_action_create",
    label: "创建动作",
    group: "write",
    category: "action",
    description: "新建动作：仅 info.json 字段 title/description/icon",
  },
  {
    id: "qkrpc_profile_create",
    label: "新建动作页",
    group: "write",
    category: "layout",
    description: "创建动作页标签",
  },
  {
    id: "qkrpc_profile_delete",
    label: "删除动作页",
    group: "write",
    category: "layout",
    description: "删除动作页标签",
  },
  {
    id: "qkrpc_profile_prune",
    label: "清理空动作页",
    group: "write",
    category: "layout",
    description: "按 scope/exe 清理空页",
  },
  {
    id: "qkrpc_profile_reorder",
    label: "排序动作页",
    group: "write",
    category: "layout",
    description: "重排动作页顺序",
  },
  {
    id: "qkrpc_process_ensure",
    label: "虚拟进程布局",
    group: "write",
    category: "layout",
    description: "为 exe 确保虚拟进程动作页",
  },
  {
    id: "qkrpc_subprogram_query",
    label: "搜索子程序",
    group: "read",
    category: "subprogram",
    description: "list/query 公共子程序",
  },
  {
    id: "qkrpc_subprogram_get",
    label: "同步子程序",
    group: "write",
    category: "subprogram",
    description: "get：首次同步到 .quicker 工作区",
  },
  {
    id: "qkrpc_subprogram_export",
    label: "导出子程序",
    group: "write",
    category: "subprogram",
    description: "导出到目录",
  },
  {
    id: "qkrpc_subprogram_import",
    label: "导入子程序",
    group: "write",
    category: "subprogram",
    description: "从目录导入",
  },
  {
    id: "qkrpc_subprogram_edit",
    label: "打开子程序设计器",
    group: "write",
    category: "subprogram",
    description: "Quicker 桌面 UI 编辑",
  },
  {
    id: "qkrpc_subprogram_create",
    label: "创建子程序",
    group: "write",
    category: "subprogram",
    description: "新建并 bootstrap 工作区项目",
  },
  {
    id: "qkrpc_step_runner_search",
    label: "搜索步骤模块",
    group: "read",
    category: "catalog",
    description: "查 StepRunner key（写步骤前必搜，禁止猜键名）",
  },
  {
    id: "qkrpc_step_runner_get",
    label: "查看模块定义",
    group: "read",
    category: "catalog",
    description: "压缩 schema + inputParams 键名（Agent 专用，非 get-ui）",
  },
  {
    id: "qkrpc_fa",
    label: "查找图标",
    group: "read",
    category: "catalog",
    description: "搜索/解析 fa: 规格（元数据图标，禁止猜）",
  },
  {
    id: "launcher_resolve",
    label: "启动器解析",
    group: "read",
    category: "settings",
    description:
      "统一搜索设置/动作/子程序；query 支持 | 同义词与 * 通配，返回 match.term/on 与 missedTerms",
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

/** Consolidated-era mega-tool ids → split registry tools (prefs migration). */
const LEGACY_MEGA_ACTION_EXPAND: Record<string, readonly string[]> = {
  qkrpc_action: [
    "qkrpc_action_get",
    "qkrpc_action_edit",
    "qkrpc_action_edit_var",
    "qkrpc_action_set_metadata",
    "qkrpc_action_move",
    "qkrpc_action_publish",
  ],
  qkrpc_action_run: [
    "qkrpc_action_run",
    "qkrpc_action_debug",
    "qkrpc_action_float",
  ],
  qkrpc_action_manage: [
    "qkrpc_profile_create",
    "qkrpc_profile_delete",
    "qkrpc_profile_prune",
    "qkrpc_profile_reorder",
    "qkrpc_process_ensure",
  ],
};

/** Consolidated-era mega-tool ids → split registry tools (prefs migration). */
const LEGACY_MEGA_SUBPROGRAM_EXPAND: Record<string, readonly string[]> = {
  qkrpc_subprogram: [
    "qkrpc_subprogram_get",
    "qkrpc_subprogram_export",
    "qkrpc_subprogram_import",
    "qkrpc_subprogram_edit",
  ],
  qkrpc_subprogram_manage: ["qkrpc_subprogram_create"],
};

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
  qkrpc_action_get: "qkrpc_action_get",
  qkrpc_action_replace: "workspace_program",
  qkrpc_action_publish: "qkrpc_action_publish",
  qkrpc_action_set_metadata: "qkrpc_action_set_metadata",
  qkrpc_action_edit: "qkrpc_action_edit",
  qkrpc_action_edit_var: "qkrpc_action_edit_var",
  qkrpc_action_float: "qkrpc_action_float",
  qkrpc_action_move: "qkrpc_action_move",
  qkrpc_profile_create: "qkrpc_profile_create",
  qkrpc_profile_delete: "qkrpc_profile_delete",
  qkrpc_profile_reorder: "qkrpc_profile_reorder",
  qkrpc_process_ensure: "qkrpc_process_ensure",
  qkrpc_action_patch: "workspace_program",
  qkrpc_action_update: "qkrpc_action_publish",
  qkrpc_subprogram_list: "qkrpc_subprogram_query",
  qkrpc_subprogram_search: "qkrpc_subprogram_query",
  qkrpc_subprogram_get: "qkrpc_subprogram_get",
  qkrpc_subprogram_create: "qkrpc_subprogram_create",
  qkrpc_subprogram_patch: "workspace_program",
  qkrpc_subprogram_replace: "workspace_program",
  qkrpc_subprogram_export: "qkrpc_subprogram_export",
  qkrpc_subprogram_import: "qkrpc_subprogram_import",
  qkrpc_subprogram_edit: "qkrpc_subprogram_edit",
  qkrpc_subprogram_edit_var: "qkrpc_subprogram_edit_var",
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
  workspace_file_list: "workspace_file",
};

type StoredToolPrefsV1 = {
  v: 1;
  enabled: string[];
  registryIds: string[];
};

function expandLegacyMegaToolIds(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const actionExpand = LEGACY_MEGA_ACTION_EXPAND[id];
    if (actionExpand) {
      out.push(...actionExpand);
      continue;
    }
    const subExpand = LEGACY_MEGA_SUBPROGRAM_EXPAND[id];
    if (subExpand) {
      out.push(...subExpand);
      continue;
    }
    out.push(LEGACY_TOOL_ID_MAP[id] ?? id);
  }
  return [...new Set(out)];
}

function migrateStoredToolIds(ids: string[]): string[] {
  return expandLegacyMegaToolIds(ids);
}

function filterKnownToolIds(ids: string[]): string[] {
  return migrateStoredToolIds(ids).filter((id) => registryById.has(id));
}

function expandLegacyConsolidatedPrefs(
  ids: string[],
  savedRegistryIds: string[],
): string[] {
  const set = new Set(migrateStoredToolIds(ids));
  for (const [megaId, splitIds] of Object.entries(LEGACY_MEGA_ACTION_EXPAND)) {
    if (savedRegistryIds.includes(megaId) && ids.includes(megaId)) {
      for (const id of splitIds) {
        set.add(id);
      }
    }
  }
  for (const [megaId, splitIds] of Object.entries(LEGACY_MEGA_SUBPROGRAM_EXPAND)) {
    if (savedRegistryIds.includes(megaId) && ids.includes(megaId)) {
      for (const id of splitIds) {
        set.add(id);
      }
    }
  }
  return [...set];
}

function normalizeSavedRegistryIds(ids: string[]): string[] {
  let expanded = [...ids];
  for (const [megaId, splitIds] of Object.entries(LEGACY_MEGA_ACTION_EXPAND)) {
    if (ids.includes(megaId)) {
      expanded = expanded.filter((id) => id !== megaId);
      expanded.push(...splitIds);
    }
  }
  for (const [megaId, splitIds] of Object.entries(LEGACY_MEGA_SUBPROGRAM_EXPAND)) {
    if (ids.includes(megaId)) {
      expanded = expanded.filter((id) => id !== megaId);
      expanded.push(...splitIds);
    }
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

function writeStoredToolPrefs(enabledIds: string[]): void {
  const enabled = ALL_QKRPC_TOOL_IDS.filter((id) => enabledIds.includes(id));
  const payload: StoredToolPrefsV1 = {
    v: 1,
    enabled,
    registryIds: [...ALL_QKRPC_TOOL_IDS],
  };
  localStorage.setItem(TOOL_APPROVAL_STORAGE_KEY, JSON.stringify(payload));
}

/**
 * Enabled tools after page load/refresh. Always returns the full registry;
 * ToolSelector toggles apply for the current session only.
 */
export function loadStoredEnabledTools(): string[] {
  const all = defaultEnabledToolIds();
  if (typeof window === "undefined") return all;
  try {
    writeStoredToolPrefs(all);
  } catch {
    /* ignore */
  }
  return all;
}

export function storeEnabledTools(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    writeStoredToolPrefs(ids);
  } catch {
    /* ignore */
  }
}
