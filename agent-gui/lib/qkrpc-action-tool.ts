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
  trace: "调试",
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

export function isQkrpcActionTraceInput(input: unknown): boolean {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return false;
  }
  const obj = input as Record<string, unknown>;
  return obj.trace === true || obj.debug === true;
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

/** run / edit / trace / … for qkrpc_action and legacy action tools. */
export function resolveQkrpcActionCommandVerb(
  toolName: string,
  input?: unknown,
): string | null {
  const legacy = LEGACY_ACTION_COMMAND_VERB[toolName];
  if (legacy) {
    if (legacy === "run" && isQkrpcActionTraceInput(input)) return "trace";
    return legacy;
  }
  if (toolName !== QKRPC_ACTION_TOOL) return null;
  const action = readQkrpcAction(input);
  if (!action) return null;
  if (action === "run" && isQkrpcActionTraceInput(input)) return "trace";
  return action;
}

export function isQkrpcActionCommandTool(toolName: string, input?: unknown): boolean {
  return resolveQkrpcActionCommandVerb(toolName, input) !== null;
}

/** User-facing tool row title, e.g. 调试 / 运行 / 编辑. */
export function qkrpcActionCommandDisplayName(
  toolName: string,
  input?: unknown,
): string | null {
  const verb = resolveQkrpcActionCommandVerb(toolName, input);
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

/** Summary line under the tool title (action name, trace stats, message). */
export function formatQkrpcActionCommandResultMeta(
  toolName: string,
  input: unknown,
  data: Record<string, unknown>,
): string | null {
  const title = readActionTitleFromData(data);
  const message = typeof data.message === "string" ? data.message.trim() : "";
  const verb =
    resolveQkrpcActionCommandVerb(toolName, input)
    ?? (typeof data.action === "string" ? data.action.trim() : null);

  if (title) {
    if (verb === "trace" || data.action === "trace") {
      const parts: string[] = [title];
      if (typeof data.eventCount === "number") {
        parts.push(`${data.eventCount} 步`);
      }
      if (typeof data.durationMs === "number") {
        parts.push(`${Math.round(data.durationMs)}ms`);
      }
      return parts.length > 1 ? parts.join(" · ") : `${title} · 终端 trace`;
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
): string | null {
  const label = qkrpcActionCommandDisplayName(toolName, input);
  return label ? `${label}中…` : null;
}
