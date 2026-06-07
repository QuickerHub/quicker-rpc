/** Client-safe qkrpc action tool helpers. */

export const QKRPC_ACTION_QUERY_TOOL = "qkrpc_action_query";
export const QKRPC_ACTION_TOOL = "qkrpc_action";
export const QKRPC_ACTION_MANAGE_TOOL = "qkrpc_action_manage";

export const QKRPC_ACTION_TOOL_IDS = [
  QKRPC_ACTION_QUERY_TOOL,
  QKRPC_ACTION_TOOL,
  QKRPC_ACTION_MANAGE_TOOL,
] as const;

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

export function isQkrpcActionGetTool(toolName: string, input?: unknown): boolean {
  if (toolName === "qkrpc_action_get") return true;
  if (toolName !== QKRPC_ACTION_TOOL) return false;
  return readQkrpcAction(input) === "get";
}

export function isQkrpcActionCreateTool(toolName: string, input?: unknown): boolean {
  if (toolName === "qkrpc_action_create") return true;
  if (toolName === QKRPC_ACTION_MANAGE_TOOL) {
    return readQkrpcAction(input) === "create";
  }
  if (toolName !== QKRPC_ACTION_TOOL) return false;
  return readQkrpcAction(input) === "create";
}

const LEGACY_ACTION_COMMAND_VERB: Record<string, string> = {
  qkrpc_action_run: "run",
  qkrpc_action_edit: "edit",
  qkrpc_action_float: "float",
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
  const action = readQkrpcAction(input);
  if (action === "debug" || action === "trace") return "debug";

  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    const obj = input as Record<string, unknown>;
    if (readBooleanFlag(obj, "trace")) return "debug";
  }
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
  input?: unknown,
  outputData?: Record<string, unknown> | null,
): string {
  return resolveQkrpcActionRunMode(input, outputData) === "debug" ? "debug" : "run";
}

/** run / edit / debug / … for qkrpc_action and legacy action tools. */
export function resolveQkrpcActionCommandVerb(
  toolName: string,
  input?: unknown,
  outputData?: Record<string, unknown> | null,
): string | null {
  const legacy = LEGACY_ACTION_COMMAND_VERB[toolName];
  if (legacy) {
    if (legacy === "run") return resolveRunCommandVerb(input, outputData);
    return legacy;
  }
  if (toolName !== QKRPC_ACTION_TOOL) return null;
  const action = readQkrpcAction(input);
  if (!action) return null;
  if (action === "debug" || action === "trace") return "debug";
  if (action === "run") return resolveRunCommandVerb(input, outputData);
  return action;
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
