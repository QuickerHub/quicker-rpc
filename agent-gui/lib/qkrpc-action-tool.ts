/** Client-safe qkrpc action tool helpers. */

export const QKRPC_ACTION_QUERY_TOOL = "qkrpc_action_query";
export const QKRPC_ACTION_GET_TOOL = "qkrpc_action_get";
export const QKRPC_ACTION_EDIT_TOOL = "qkrpc_action_edit";
export const QKRPC_ACTION_EDIT_VAR_TOOL = "qkrpc_action_edit_var";
export const QKRPC_ACTION_SET_METADATA_TOOL = "qkrpc_action_set_metadata";
export const QKRPC_ACTION_MOVE_TOOL = "qkrpc_action_move";
export const QKRPC_ACTION_PUBLISH_TOOL = "qkrpc_action_publish";
export const QKRPC_ACTION_RUN_TOOL = "qkrpc_action_run";
export const QKRPC_ACTION_DEBUG_TOOL = "qkrpc_action_debug";
export const QKRPC_ACTION_FLOAT_TOOL = "qkrpc_action_float";
export const QKRPC_ACTION_CREATE_TOOL = "qkrpc_action_create";
export const QKRPC_PROFILE_CREATE_TOOL = "qkrpc_profile_create";
export const QKRPC_PROFILE_DELETE_TOOL = "qkrpc_profile_delete";
export const QKRPC_PROFILE_PRUNE_TOOL = "qkrpc_profile_prune";
export const QKRPC_PROFILE_REORDER_TOOL = "qkrpc_profile_reorder";
export const QKRPC_PROCESS_ENSURE_TOOL = "qkrpc_process_ensure";

/** @deprecated Consolidated-era mega-tool id (legacy replay only). */
export const QKRPC_ACTION_TOOL = "qkrpc_action";
/** @deprecated Consolidated-era mega-tool id (legacy replay only). */
export const QKRPC_ACTION_MANAGE_TOOL = "qkrpc_action_manage";

export const QKRPC_ACTION_TOOL_IDS = [
  QKRPC_ACTION_QUERY_TOOL,
  QKRPC_ACTION_GET_TOOL,
  QKRPC_ACTION_EDIT_TOOL,
  QKRPC_ACTION_EDIT_VAR_TOOL,
  QKRPC_ACTION_SET_METADATA_TOOL,
  QKRPC_ACTION_MOVE_TOOL,
  QKRPC_ACTION_PUBLISH_TOOL,
  QKRPC_ACTION_RUN_TOOL,
  QKRPC_ACTION_DEBUG_TOOL,
  QKRPC_ACTION_FLOAT_TOOL,
  QKRPC_ACTION_CREATE_TOOL,
  QKRPC_PROFILE_CREATE_TOOL,
  QKRPC_PROFILE_DELETE_TOOL,
  QKRPC_PROFILE_PRUNE_TOOL,
  QKRPC_PROFILE_REORDER_TOOL,
  QKRPC_PROCESS_ENSURE_TOOL,
] as const;

const RUN_TOOL_IDS = new Set([
  QKRPC_ACTION_RUN_TOOL,
  QKRPC_ACTION_DEBUG_TOOL,
  QKRPC_ACTION_FLOAT_TOOL,
]);

const LEGACY_LIST_TOOLS = new Set(["qkrpc_action_list", "qkrpc_action_search"]);

export function readQkrpcAction(input: unknown): string | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const action = (input as Record<string, unknown>).action;
  return typeof action === "string" && action.trim() ? action.trim() : null;
}

export function isActionListTool(toolName: string, input?: unknown): boolean {
  if (LEGACY_LIST_TOOLS.has(toolName)) return true;
  if (toolName === QKRPC_ACTION_QUERY_TOOL) return true;
  if (toolName !== QKRPC_ACTION_TOOL) return false;
  const action = readQkrpcAction(input);
  return action === "list" || action === "search";
}

export function actionListSourceFromTool(
  toolName: string,
  _input?: unknown,
): "list" | "search" | null {
  if (toolName === "qkrpc_action_search") return "search";
  if (
    toolName === QKRPC_ACTION_QUERY_TOOL
    || toolName === "qkrpc_action_list"
    || toolName === QKRPC_ACTION_TOOL
  ) {
    const action = readQkrpcAction(_input);
    if (toolName === QKRPC_ACTION_TOOL && action === "search") return "search";
    return "list";
  }
  return null;
}

export function isQkrpcActionRunTool(toolName: string, input?: unknown): boolean {
  if (RUN_TOOL_IDS.has(toolName)) return true;
  if (toolName === QKRPC_ACTION_TOOL) {
    const action = readQkrpcAction(input);
    return action === "run" || action === "debug" || action === "float" || action === "trace";
  }
  return false;
}

export function isQkrpcActionGetTool(toolName: string, input?: unknown): boolean {
  if (toolName === QKRPC_ACTION_GET_TOOL) return true;
  if (toolName !== QKRPC_ACTION_TOOL) return false;
  return readQkrpcAction(input) === "get";
}

export function isQkrpcActionCreateTool(toolName: string, input?: unknown): boolean {
  if (toolName === QKRPC_ACTION_CREATE_TOOL || toolName === "qkrpc_action_create") {
    return true;
  }
  if (toolName === QKRPC_ACTION_MANAGE_TOOL) {
    return readQkrpcAction(input) === "create";
  }
  if (toolName !== QKRPC_ACTION_TOOL) return false;
  return readQkrpcAction(input) === "create";
}

/** User-facing title for create tool rows. */
export function qkrpcActionCreateDisplayName(
  toolName: string,
  input?: unknown,
): string | null {
  if (!isQkrpcActionCreateTool(toolName, input)) return null;
  return "创建动作";
}

export function readActionCreateTitleFromInput(input: unknown): string | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const record = input as Record<string, unknown>;
  const info = record.info;
  if (typeof info === "object" && info !== null && !Array.isArray(info)) {
    const title = (info as Record<string, unknown>).title;
    if (typeof title === "string" && title.trim()) return title.trim();
  }
  const title = record.title;
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

const LEGACY_ACTION_COMMAND_VERB: Record<string, string> = {
  qkrpc_action_run: "run",
  qkrpc_action_debug: "debug",
  qkrpc_action_float: "float",
  qkrpc_action_edit: "edit",
  qkrpc_action_get: "get",
  qkrpc_action_replace: "replace",
  qkrpc_action_publish: "publish",
  qkrpc_action_set_metadata: "set_metadata",
  qkrpc_action_edit_var: "edit_var",
  qkrpc_action_move: "move",
  qkrpc_action_delete: "delete",
};

const ACTION_COMMAND_VERB_LABEL: Record<string, string> = {
  run: "运行",
  debug: "调试",
  edit: "编辑",
  float: "悬浮",
  get: "读取",
  replace: "替换",
  publish: "分享",
  set_metadata: "改元数据",
  edit_var: "改变量",
  move: "移动",
  delete: "删除",
};

export function readBooleanFlag(obj: Record<string, unknown>, key: string): boolean {
  const value = obj[key];
  return value === true || value === "true" || value === 1;
}

export type QkrpcActionRunMode = "debug" | "run";

function outputIndicatesDebugRun(
  outputData: Record<string, unknown>,
): boolean {
  if (outputData.action === "debug" || outputData.action === "trace") {
    return true;
  }
  if (readBooleanFlag(outputData, "trace")) return true;
  return Array.isArray(outputData.events) && outputData.events.length > 0;
}

/** Resolve direct run vs terminal debug (step trace in side panel). */
export function resolveQkrpcActionRunMode(
  input?: unknown,
  outputData?: Record<string, unknown> | null,
): QkrpcActionRunMode {
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    const obj = input as Record<string, unknown>;
    if (readBooleanFlag(obj, "trace")) return "debug";
  }
  const action = readQkrpcAction(input);
  if (action === "debug" || action === "trace") return "debug";

  if (outputData && outputIndicatesDebugRun(outputData)) {
    return "debug";
  }
  return "run";
}

/** Normalize legacy trace action/flags into debug. */
export function normalizeQkrpcActionInput(input: unknown): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return input;
  }
  const obj = input as Record<string, unknown>;
  if (obj.action === "trace") {
    const next: Record<string, unknown> = { ...obj, action: "debug" };
    delete next.trace;
    return next;
  }
  if (obj.action !== "run") return input;

  const hasTraceFlag = readBooleanFlag(obj, "trace");
  const next: Record<string, unknown> = { ...obj };
  delete next.trace;
  delete next.debug;
  if (hasTraceFlag) {
    delete next.wait;
    next.action = "debug";
  }
  return next;
}

/** @deprecated use resolveQkrpcActionRunMode(input) === "debug" */
export function isQkrpcActionTraceInput(input: unknown): boolean {
  return resolveQkrpcActionRunMode(input) === "debug";
}

export function isQkrpcActionDebugRunInput(input: unknown): boolean {
  return resolveQkrpcActionRunMode(input) === "debug";
}

export function readQkrpcActionIdFromInput(input: unknown): string | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const id = (input as Record<string, unknown>).id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export function readQkrpcActionParamFromInput(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return undefined;
  }
  const param = (input as Record<string, unknown>).param;
  return typeof param === "string" && param.trim() ? param.trim() : undefined;
}

function resolveRunCommandVerb(
  toolName: string,
  input?: unknown,
  outputData?: Record<string, unknown> | null,
): string {
  if (toolName === QKRPC_ACTION_DEBUG_TOOL) return "debug";
  if (toolName === QKRPC_ACTION_FLOAT_TOOL) return "float";
  return resolveQkrpcActionRunMode(input, outputData) === "debug" ? "debug" : "run";
}

/** run / edit / debug / … for split action tools and legacy routers. */
export function resolveQkrpcActionCommandVerb(
  toolName: string,
  input?: unknown,
  outputData?: Record<string, unknown> | null,
): string | null {
  const legacy = LEGACY_ACTION_COMMAND_VERB[toolName];
  if (legacy) {
    if (legacy === "run") return resolveRunCommandVerb(toolName, input, outputData);
    return legacy;
  }
  if (toolName === QKRPC_ACTION_TOOL) {
    const action = readQkrpcAction(input);
    if (!action) return null;
    if (action === "float") return "float";
    if (action === "debug" || action === "trace") return "debug";
    if (action === "run") return resolveRunCommandVerb(toolName, input, outputData);
    return action;
  }
  return null;
}

export function isQkrpcActionCommandTool(toolName: string, input?: unknown): boolean {
  return resolveQkrpcActionCommandVerb(toolName, input) !== null;
}

/** User-facing tool row title, e.g. 调试 / 运行 / 编辑. */
export function qkrpcActionCommandDisplayName(
  toolName: string,
  input?: unknown,
  outputData?: Record<string, unknown> | null,
): string | null {
  const verb = resolveQkrpcActionCommandVerb(toolName, input, outputData);
  if (!verb) return null;
  return ACTION_COMMAND_VERB_LABEL[verb] ?? null;
}

function readActionTitleFromData(data: Record<string, unknown>): string {
  const title =
    typeof data.actionTitle === "string"
      ? data.actionTitle.trim()
      : typeof data.title === "string"
        ? data.title.trim()
        : "";
  return title;
}

/** Summary line under the tool title (action name, debug stats, message). */
export function formatQkrpcActionCommandResultMeta(
  toolName: string,
  input: unknown,
  data: Record<string, unknown>,
): string | null {
  const title = readActionTitleFromData(data);
  const message = typeof data.message === "string" ? data.message.trim() : "";
  const verb = resolveQkrpcActionCommandVerb(toolName, input, data);

  if (title) {
    if (verb === "debug") {
      const parts: string[] = [title];
      if (typeof data.eventCount === "number") {
        parts.push(`${data.eventCount} 步`);
      }
      if (typeof data.durationMs === "number") {
        parts.push(`${Math.round(data.durationMs)}ms`);
      }
      const failureLocation = data.failureLocation;
      if (
        typeof failureLocation === "object"
        && failureLocation !== null
        && !Array.isArray(failureLocation)
      ) {
        const loc = failureLocation as Record<string, unknown>;
        const summary = typeof loc.locationSummary === "string"
          ? loc.locationSummary.trim()
          : "";
        if (summary) {
          parts.push(summary.length > 56 ? `${summary.slice(0, 53)}…` : summary);
        }
      }
      return parts.length > 1 ? parts.join(" · ") : `${title} · 调试输出`;
    }
    if (message && message.length <= 48) {
      return `${title} · ${message}`;
    }
    return title;
  }

  if (message) return message.slice(0, 72);

  const verbLabel = verb ? ACTION_COMMAND_VERB_LABEL[verb] : null;
  return verbLabel ?? null;
}

export function qkrpcActionCommandRunningMeta(
  toolName: string,
  input?: unknown,
  outputData?: Record<string, unknown> | null,
): string | null {
  const label = qkrpcActionCommandDisplayName(toolName, input, outputData);
  return label ? `${label}中…` : null;
}
