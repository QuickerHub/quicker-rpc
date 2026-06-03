import {
  getToolOrDynamicToolName,
  isToolOrDynamicToolUIPart,
  type UIMessage,
} from "ai";
import { parseUserMessageContent } from "@/lib/compose-user-message";
import { isStructuredToolResult } from "@/lib/tool-result";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const QKA_TAG_RE =
  /<qka\s+id="([^"]+)"[^>]*>([^<]*)<\/qka>/gi;

const WORKSPACE_ACTION_TOOLS = new Set([
  "workspace_action_read_data",
  "workspace_action_write_data",
  "workspace_action_edit_data",
]);

const ACTION_ID_TOOLS = new Set([
  "qkrpc_action_get",
  "qkrpc_action_patch",
  "qkrpc_action_create",
  "qkrpc_action_set_metadata",
  "qkrpc_action_delete",
  "qkrpc_action_run",
  ...WORKSPACE_ACTION_TOOLS,
]);

export type ScopedActionRef = {
  id: string;
  title?: string;
  source: "user-tag" | "tool";
};

export type ActionScopeHint = {
  /** Single action the user @-pinned in the latest user turn (hard bind). */
  pinnedLatest?: ScopedActionRef;
  /** All @-pinned actions in the latest user turn. */
  pinnedLatestAll: ScopedActionRef[];
  /** Most recent action id from tool inputs/outputs in the thread. */
  lastToolActionId?: string;
  lastToolActionTitle?: string;
  /** Action ids with a local .quicker/actions project (when cwd is set). */
  localProjectIds: string[];
};

function normalizeId(id: string): string {
  return id.trim().toLowerCase();
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

function readIdFromRecord(record: Record<string, unknown>): string | undefined {
  for (const key of ["id", "actionId", "ActionId"]) {
    const value = record[key];
    if (typeof value === "string" && isUuid(value)) {
      return value.trim();
    }
  }
  return undefined;
}

function extractQkaFromText(text: string): ScopedActionRef[] {
  const refs: ScopedActionRef[] = [];
  const re = new RegExp(QKA_TAG_RE.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const id = match[1]?.trim();
    if (!id || !isUuid(id)) continue;
    const title = match[2]?.trim() || undefined;
    refs.push({ id, title, source: "user-tag" });
  }
  return refs;
}

function extractTagsFromUserText(text: string): ScopedActionRef[] {
  const fromQka = extractQkaFromText(text);
  if (fromQka.length > 0) return fromQka;
  const parsed = parseUserMessageContent(text);
  return parsed.tags.map((tag) => ({
    id: tag.id,
    title: tag.title,
    source: "user-tag" as const,
  }));
}

function readActionIdFromToolPart(part: {
  input?: unknown;
  output?: unknown;
}): string | undefined {
  if (typeof part.input === "object" && part.input !== null) {
    const fromInput = readIdFromRecord(part.input as Record<string, unknown>);
    if (fromInput) return fromInput;
  }
  if (!isStructuredToolResult(part.output) || !part.output.ok) return undefined;
  const data = part.output.data;
  if (typeof data !== "object" || data === null) return undefined;
  const root = data as Record<string, unknown>;
  const payload =
    typeof root.payload === "object" && root.payload !== null
      ? (root.payload as Record<string, unknown>)
      : root;
  return readIdFromRecord(payload);
}

function readTitleFromToolOutput(output: unknown): string | undefined {
  if (!isStructuredToolResult(output) || !output.ok) return undefined;
  const data = output.data;
  if (typeof data !== "object" || data === null) return undefined;
  const root = data as Record<string, unknown>;
  const payload =
    typeof root.payload === "object" && root.payload !== null
      ? (root.payload as Record<string, unknown>)
      : root;
  const compressed =
    typeof payload.compressed === "object" && payload.compressed !== null
      ? (payload.compressed as Record<string, unknown>)
      : undefined;
  const title = payload.title ?? compressed?.title;
  return typeof title === "string" && title.trim() ? title.trim() : undefined;
}

/** Build action scope from chat messages (call before streamText). */
export function extractActionScopeFromMessages(
  messages: UIMessage[],
  localProjectIds: string[] = [],
): ActionScopeHint {
  let pinnedLatestAll: ScopedActionRef[] = [];
  let lastToolActionId: string | undefined;
  let lastToolActionTitle: string | undefined;

  for (let mi = messages.length - 1; mi >= 0; mi--) {
    const message = messages[mi]!;
    if (message.role === "user") {
      const textParts = (message.parts ?? [])
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text);
      const combined = textParts.join("\n");
      pinnedLatestAll = extractTagsFromUserText(combined);
      break;
    }
  }

  for (let mi = messages.length - 1; mi >= 0; mi--) {
    const parts = messages[mi]?.parts ?? [];
    for (let pi = parts.length - 1; pi >= 0; pi--) {
      const part = parts[pi]!;
      if (!isToolOrDynamicToolUIPart(part)) continue;
      const toolName = getToolOrDynamicToolName(part);
      if (!ACTION_ID_TOOLS.has(toolName)) continue;
      const actionId = readActionIdFromToolPart(part);
      if (!actionId) continue;
      lastToolActionId = actionId;
      lastToolActionTitle = readTitleFromToolOutput(part.output);
      break;
    }
    if (lastToolActionId) break;
  }

  const pinnedLatest =
    pinnedLatestAll.length === 1 ? pinnedLatestAll[0] : undefined;

  return {
    pinnedLatest,
    pinnedLatestAll,
    lastToolActionId,
    lastToolActionTitle,
    localProjectIds: [...new Set(localProjectIds.map((id) => id.trim()).filter(isUuid))],
  };
}

export function getPrimaryActionId(scope: ActionScopeHint | undefined): string | undefined {
  if (!scope) return undefined;
  return scope.pinnedLatest?.id ?? scope.lastToolActionId;
}

/** Hard guard: reject workspace_action_* id when it conflicts with user @ pin. */
export function guardWorkspaceActionId(
  requestedId: string,
  scope: ActionScopeHint | undefined,
):
  | { ok: true; id: string }
  | { ok: false; error: string } {
  const id = requestedId.trim();
  if (!isUuid(id)) {
    return { ok: false, error: "id must be a Quicker action GUID." };
  }
  if (!scope) return { ok: true, id };

  const pinned = scope.pinnedLatestAll;
  if (pinned.length === 1) {
    const expected = pinned[0]!.id;
    if (normalizeId(id) !== normalizeId(expected)) {
      const label = pinned[0]!.title ? `「${pinned[0]!.title}」` : expected;
      return {
        ok: false,
        error:
          `Action id mismatch: the user pinned ${label} (${expected}) in the latest message, but the tool used ${id}. Use the pinned id only.`,
      };
    }
    return { ok: true, id: expected };
  }

  if (pinned.length > 1) {
    const allowed = new Set(pinned.map((p) => normalizeId(p.id)));
    if (!allowed.has(normalizeId(id))) {
      const list = pinned
        .map((p) => `${p.title ?? p.id} (${p.id})`)
        .join("; ");
      return {
        ok: false,
        error:
          `Multiple actions pinned in the latest user message: ${list}. Use one of these ids.`,
      };
    }
  }

  return { ok: true, id };
}

export function formatActionScopeForSystem(scope: ActionScopeHint | undefined): string {
  if (!scope) return "";

  const lines: string[] = [
    "## Action scope (binding)",
    "- workspace_action_read_data / write_data / edit_data read and write **local** .quicker/actions/{id}/data.json only.",
    "- When the user @-pins exactly one action in their latest message, use **only** that id for workspace_action_* — do not substitute ids from search/create.",
  ];

  if (scope.pinnedLatest) {
    const p = scope.pinnedLatest;
    lines.push(
      `- **Pinned (latest user message):** ${p.title ?? "action"} → \`${p.id}\` (required for workspace_action_*).`,
    );
  } else if (scope.pinnedLatestAll.length > 1) {
    lines.push("- **Pinned (latest user message, pick one):**");
    for (const p of scope.pinnedLatestAll) {
      lines.push(`  - ${p.title ?? "action"} → \`${p.id}\``);
    }
  }

  if (scope.lastToolActionId) {
    const label = scope.lastToolActionTitle
      ? `${scope.lastToolActionTitle} → `
      : "";
    lines.push(
      `- **Last action tool in thread:** ${label}\`${scope.lastToolActionId}\` (continue this unless the user pinned a different action).`,
    );
  }

  if (scope.localProjectIds.length > 0) {
    lines.push(
      `- **Synced local projects:** ${scope.localProjectIds.map((id) => `\`${id}\``).join(", ")}.`,
    );
    lines.push(
      "- If workspace_action_* fails with no local project, call qkrpc_action_get({ id }) for that same id before read_data (auto-sync may run when id matches pinned scope).",
    );
  } else {
    lines.push(
      "- No local .quicker/actions projects in the current working directory — call qkrpc_action_get({ id }) before workspace_action_read_data.",
    );
  }

  return lines.join("\n");
}

export function enrichActionProjectResolveError(
  baseError: string,
  scope: ActionScopeHint | undefined,
  requestedId: string,
): string {
  const parts = [baseError];
  const primary = getPrimaryActionId(scope);
  if (primary && normalizeId(primary) !== normalizeId(requestedId)) {
    parts.push(
      `Hint: the conversation scope points to ${primary}; you used ${requestedId}.`,
    );
  }
  if (scope?.localProjectIds.length) {
    parts.push(
      `Local synced ids: ${scope.localProjectIds.join(", ")}.`,
    );
  }
  return parts.join(" ");
}
