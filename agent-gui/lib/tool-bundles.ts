import type { ActionScopeHint } from "@/lib/action-scope";
import type { ChatMode } from "@/lib/chat-mode";
import { CHAT_MODE_AGENT } from "@/lib/chat-mode";
import type { AgentTurnIntent } from "@/lib/agent-turn-state";
import { LIST_TOOLS_TOOL } from "@/lib/list-tools-tool";
import { SET_THREAD_TITLE_TOOL } from "@/lib/set-thread-title-tool";

/** Named tool packs — like skill modules; core is always full-schema on every turn. */
export type ToolBundleId =
  | "core"
  | "action_authoring"
  | "action_authoring_extended"
  | "action_layout"
  | "browser"
  | "settings"
  | "runtime_extras"
  | "destructive"
  | "dev";

export type ToolBundleDefinition = {
  id: ToolBundleId;
  label: string;
  description: string;
  toolIds: readonly string[];
};

export const TOOL_BUNDLE_DEFINITIONS: readonly ToolBundleDefinition[] = [
  {
    id: "core",
    label: "核心",
    description:
      "通用助手：docs、文件读写搜索、Shell、web_search、动作查询/运行/调试、Quicker 设置、等待连接、list_tools。",
    toolIds: [
      LIST_TOOLS_TOOL,
      "docs",
      "Read",
      "Write",
      "StrReplace",
      "Grep",
      "Shell",
      "web_search",
      "qkrpc_wait",
      "ask_question",
      "quicker_settings",
      "qkrpc_action_query",
      "qkrpc_action_run",
      "qkrpc_action_debug",
    ],
  },
  {
    id: "action_authoring",
    label: "写动作",
    description:
      "无头编辑：workspace_program、action/subprogram get/create/transfer、step_runner search/get、fa、元数据、publish、trigger、designer_open。",
    toolIds: [
      "workspace_program",
      "qkrpc_action_get",
      "qkrpc_action_create",
      "qkrpc_subprogram_query",
      "qkrpc_subprogram_get",
      "qkrpc_subprogram_create",
      "qkrpc_step_runner_search",
      "qkrpc_step_runner_get",
      "qkrpc_fa",
      "qkrpc_action_set_metadata",
    ],
  },
  {
    id: "action_authoring_extended",
    label: "写动作扩展",
    description:
      "发布、设计器、触发器、子程序导入导出、变量编辑 — list_tools bundle 按需加载。",
    toolIds: [
      "qkrpc_subprogram_transfer",
      "qkrpc_action_edit_var",
      "qkrpc_action_publish",
      "qkrpc_designer_open",
      "quicker_trigger",
    ],
  },
  {
    id: "action_layout",
    label: "动作页布局",
    description: "动作页 Tab、网格移动、虚拟进程布局：profile_*、move、process_ensure。",
    toolIds: [
      "qkrpc_profile_create",
      "qkrpc_profile_delete",
      "qkrpc_profile_prune",
      "qkrpc_profile_reorder",
      "qkrpc_action_move",
      "qkrpc_process_ensure",
    ],
  },
  {
    id: "browser",
    label: "浏览器",
    description: "Playwright browser、用户浏览器扩展、录制转动作步骤 browser_to_action。",
    toolIds: ["browser", "user_browser", "browser_to_action"],
  },
  {
    id: "settings",
    label: "模型配置",
    description: "聊天 LLM profile 与选用模型。",
    toolIds: ["llm_settings"],
  },
  {
    id: "runtime_extras",
    label: "运行扩展",
    description: "悬浮窗、Launcher 解析、子代理 task。",
    toolIds: [
      "qkrpc_action_float",
      "launcher_resolve",
      "launcher_command_cache",
      "task",
    ],
  },
  {
    id: "destructive",
    label: "删除",
    description: "删除 Quicker 动作/公共子程序（需用户确认）。",
    toolIds: ["qkrpc_action_delete", "qkrpc_subprogram_delete"],
  },
  {
    id: "dev",
    label: "开发",
    description: "agent-gui 本地 dev_frontend_check（生产不可用）。",
    toolIds: ["dev_frontend_check"],
  },
] as const;

const bundleById = new Map<ToolBundleId, ToolBundleDefinition>(
  TOOL_BUNDLE_DEFINITIONS.map((bundle) => [bundle.id, bundle]),
);

export function getToolBundle(id: ToolBundleId): ToolBundleDefinition | undefined {
  return bundleById.get(id);
}

export function listToolBundles(): ToolBundleDefinition[] {
  return [...TOOL_BUNDLE_DEFINITIONS];
}

export type ResolveActiveToolBundlesParams = {
  chatMode: ChatMode;
  intent: AgentTurnIntent;
  actionScope: ActionScopeHint;
  actionDesigner?: { entityId: string; isSubProgram?: boolean };
};

/** Bundles whose tools ship with full JSON Schema this turn (core is always included). */
export function resolveActiveToolBundles(
  params: ResolveActiveToolBundlesParams,
): ToolBundleId[] {
  const active = new Set<ToolBundleId>(["core"]);

  if (params.chatMode !== CHAT_MODE_AGENT) {
    return [...active];
  }

  const authoringContext =
    params.intent === "action_authoring"
    || params.actionScope.pinnedLatestAll.length > 0
    || !!params.actionDesigner?.entityId?.trim();

  if (authoringContext) {
    active.add("action_authoring");
  }
  if (params.intent === "web") {
    active.add("browser");
  }
  if (params.intent === "settings") {
    active.add("settings");
  }
  if (params.intent === "action_runtime") {
    active.add("runtime_extras");
  }

  return [...active];
}

/** Core tools that stay slim during action_authoring (load via list_tools when needed). */
export const AUTHORING_SLIM_CORE_TOOL_IDS: ReadonlySet<string> = new Set([
  "Shell",
  "Grep",
  "web_search",
  "StrReplace",
  "Write",
  "Read",
  "docs",
  "ask_question",
  "quicker_settings",
  "qkrpc_action_query",
  "qkrpc_action_run",
  "qkrpc_action_debug",
  "qkrpc_action_get",
  "qkrpc_fa",
  "qkrpc_subprogram_query",
  "qkrpc_subprogram_get",
  "qkrpc_subprogram_create",
  "qkrpc_action_set_metadata",
]);

function isAuthoringFullSchemaContext(params: ResolveActiveToolBundlesParams): boolean {
  return (
    params.intent === "action_authoring"
    || params.actionScope.pinnedLatestAll.length > 0
    || !!params.actionDesigner?.entityId?.trim()
  );
}

export function resolveFullSchemaToolIds(
  params: ResolveActiveToolBundlesParams,
): Set<string> {
  const ids = new Set<string>([SET_THREAD_TITLE_TOOL]);
  for (const bundleId of resolveActiveToolBundles(params)) {
    const bundle = getToolBundle(bundleId);
    if (!bundle) continue;
    for (const toolId of bundle.toolIds) {
      ids.add(toolId);
    }
  }
  if (isAuthoringFullSchemaContext(params)) {
    for (const toolId of AUTHORING_SLIM_CORE_TOOL_IDS) {
      ids.delete(toolId);
    }
  }
  return ids;
}

export function toolIdToBundleId(toolId: string): ToolBundleId | undefined {
  for (const bundle of TOOL_BUNDLE_DEFINITIONS) {
    if (bundle.toolIds.includes(toolId)) {
      return bundle.id;
    }
  }
  return undefined;
}

export function inactiveBundleSummaries(
  params: ResolveActiveToolBundlesParams,
): ToolBundleDefinition[] {
  const active = new Set(resolveActiveToolBundles(params));
  return TOOL_BUNDLE_DEFINITIONS.filter(
    (bundle) => bundle.id !== "core" && !active.has(bundle.id),
  );
}
