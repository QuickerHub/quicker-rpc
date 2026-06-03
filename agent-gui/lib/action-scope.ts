import {
  getToolOrDynamicToolName,
  isToolOrDynamicToolUIPart,
  type UIMessage,
} from "ai";
import { parseUserMessageContent } from "@/lib/compose-user-message";
import { qkrpcRequestContext } from "@/lib/qkrpc-request-context";
import { isStructuredToolResult } from "@/lib/tool-result";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const QKA_TAG_RE =
  /<qka\s+id="([^"]+)"[^>]*>([^<]*)<\/qka>/gi;

const ACTION_ID_TOOLS = new Set([
  "qkrpc_action_get",
  "qkrpc_action_patch",
  "qkrpc_action_create",
  "qkrpc_action_set_metadata",
  "qkrpc_action_delete",
  "qkrpc_action_run",
  "workspace_action_read_data",
  "workspace_action_write_data",
  "workspace_action_edit_data",
  "workspace_action_file_read",
  "workspace_action_file_write",
  "workspace_action_file_edit",
  "workspace_action_file_info",
  "workspace_action_file_search",
]);

export type ScopedActionRef = {
  id: string;
  title?: string;
  source: "user-tag" | "tool";
};

/** Optional chat context for prompts (no edit restrictions). */
export type ActionScopeHint = {
  pinnedLatest?: ScopedActionRef;
  pinnedLatestAll: ScopedActionRef[];
  lastToolActionId?: string;
  lastToolActionTitle?: string;
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
      pinnedLatestAll = extractTagsFromUserText(textParts.join("\n"));
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

/** Default id for optional auto-sync hints (not enforced). */
export function getPrimaryActionId(scope: ActionScopeHint | undefined): string | undefined {
  if (!scope) return undefined;
  return scope.pinnedLatest?.id ?? scope.lastToolActionId;
}

/** Validate action GUID only; no @-pin or scope whitelist. */
export function guardWorkspaceActionId(
  requestedId: string,
  _scope?: ActionScopeHint,
):
  | { ok: true; id: string }
  | { ok: false; error: string } {
  const id = requestedId.trim();
  if (!isUuid(id)) {
    return { ok: false, error: "id must be a Quicker action GUID." };
  }
  return { ok: true, id };
}

/** Optional context for the model (not edit restrictions). */
export function formatActionScopeForSystem(scope: ActionScopeHint | undefined): string {
  if (!scope) return "";

  const lines: string[] = [];
  if (scope.pinnedLatestAll.length > 0) {
    lines.push("## @ actions (latest user message)");
    for (const p of scope.pinnedLatestAll) {
      lines.push(`- ${p.title ?? "action"} → \`${p.id}\``);
    }
  }
  if (scope.lastToolActionId) {
    const label = scope.lastToolActionTitle
      ? `${scope.lastToolActionTitle} → `
      : "";
    lines.push(`- Last action in thread: ${label}\`${scope.lastToolActionId}\``);
  }
  if (scope.localProjectIds.length > 0) {
    lines.push(
      `- Local .quicker/actions: ${scope.localProjectIds.map((id) => `\`${id}\``).join(", ")}`,
    );
  }

  return lines.join("\n");
}

export function enrichActionProjectResolveError(
  baseError: string,
  _scope?: ActionScopeHint,
  _requestedId?: string,
): string {
  return baseError;
}

export function registerLocalActionProject(actionId: string): void {
  const id = actionId.trim();
  if (!isUuid(id)) return;
  const scope = qkrpcRequestContext.getStore()?.actionScope;
  if (!scope) return;
  const key = normalizeId(id);
  if (!scope.localProjectIds.some((existing) => normalizeId(existing) === key)) {
    scope.localProjectIds.push(id);
  }
}