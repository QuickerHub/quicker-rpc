import type { UIMessage } from "ai";
import { parseUserMessageContent } from "@/lib/compose-user-message";
import { findQkaMarkupMatches, parseQkaRefFromAttrs } from "@/lib/qka-markup";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractQkaFromText(text: string): ScopedActionRef[] {
  const refs: ScopedActionRef[] = [];
  for (const match of findQkaMarkupMatches(text)) {
    if (match.kind !== "ref") continue;
    const ref = parseQkaRefFromAttrs(match.attrs, match.innerText);
    if (!ref) continue;
    refs.push({
      id: ref.actionId,
      title: ref.title,
      source: "user-tag",
    });
  }
  return refs;
}

export type ScopedActionRef = {
  id: string;
  title?: string;
  source: "user-tag" | "designer-default";
};

/** Optional @-pin hints from the latest user message (not enforced). */
export type ActionScopeHint = {
  pinnedLatest?: ScopedActionRef;
  pinnedLatestAll: ScopedActionRef[];
};

function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
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

/** Pins from the latest user message only — same pattern as @-mentions in Cursor/Codex. */
export function extractActionScopeFromMessages(
  messages: UIMessage[],
): ActionScopeHint {
  let pinnedLatestAll: ScopedActionRef[] = [];

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

  const pinnedLatest =
    pinnedLatestAll.length === 1 ? pinnedLatestAll[0] : undefined;

  return { pinnedLatest, pinnedLatestAll };
}

/** Validate action GUID only; no pin lock. */
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

/** Optional @-pin context for the model (not edit restrictions). */
export function formatActionScopeForSystem(scope: ActionScopeHint | undefined): string {
  if (!scope || scope.pinnedLatestAll.length === 0) return "";

  const lines: string[] = ["## @ actions (latest user message)"];
  for (const p of scope.pinnedLatestAll) {
    const label =
      p.source === "designer-default" ? "designer default" : "user @";
    lines.push(`- ${p.title ?? "action"} → \`${p.id}\` (${label})`);
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
