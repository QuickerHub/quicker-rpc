import type { ActionMentionItem } from "@/lib/action-mention-items";

export type ActionPickerInsertMode = "id" | "name";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Desktop SelectActionTool uses Guid.ToString("D") — lowercase with hyphens. */
export function formatActionGuidD(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!UUID_RE.test(trimmed)) {
    return trimmed;
  }
  return trimmed;
}

export function actionPickerModeForTool(toolId: string): ActionPickerInsertMode | null {
  if (toolId === "SelectActionId") {
    return "id";
  }
  if (toolId === "SelectActionName") {
    return "name";
  }
  return null;
}

/** Value inserted into the param field after picking an action (qkrpc action list row). */
export function buildActionPickerInsertValue(
  item: ActionMentionItem,
  mode: ActionPickerInsertMode,
): string | null {
  if (mode === "id") {
    const id = formatActionGuidD(item.id.trim());
    return id || null;
  }
  const title = item.title?.trim();
  if (title && title !== "(无标题)") {
    return title;
  }
  const fallback = item.id.trim();
  return fallback.length > 0 ? fallback : null;
}

export function formatActionPickerShortId(actionId: string): string {
  const id = actionId.trim();
  if (id.length <= 13) {
    return id;
  }
  return `${id.slice(0, 8)}…`;
}
