import type { MentionKind, PinnedAction } from "@/lib/action-context";
import { getActionSummaryItems } from "@/lib/agent-api";
import {
  formatLastEditDisplay,
  normalizeUtcIso,
} from "@/lib/format-action-time";

export type ActionMentionItem = PinnedAction & {
  profileName?: string;
  exeFile?: string;
  /** Search relevance from qkrpc mention search (higher = better). */
  score?: number;
};

function unwrapPayload(parsed: unknown): unknown {
  if (typeof parsed !== "object" || parsed === null) return null;
  const root = parsed as Record<string, unknown>;
  if (typeof root.payload === "object" && root.payload !== null) {
    return root.payload;
  }
  if (typeof root.data === "object" && root.data !== null) {
    const data = root.data as Record<string, unknown>;
    if (typeof data.payload === "object" && data.payload !== null) {
      return data.payload;
    }
    return data;
  }
  return root;
}

function rawItemsArray(data: unknown): unknown[] {
  if (typeof data !== "object" || data === null) return [];
  const o = data as Record<string, unknown>;
  if (Array.isArray(o.items)) return o.items;
  if (Array.isArray(o.actions)) return o.actions;
  return [];
}

function readMentionKind(raw: Record<string, unknown>): MentionKind {
  const kind = String(raw.kind ?? "").trim().toLowerCase();
  return kind === "subprogram" ? "subprogram" : "action";
}

function mentionDedupeKey(kind: MentionKind, id: string): string {
  return `${kind}:${id}`;
}

function rawEntryToMention(raw: unknown): ActionMentionItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const kind = readMentionKind(o);
  const id = String(
    kind === "subprogram"
      ? o.subProgramId ?? o.id ?? ""
      : o.actionId ?? o.id ?? "",
  ).trim();
  if (!id) return null;
  const score =
    typeof o.score === "number" && Number.isFinite(o.score) ? o.score : undefined;
  const icon =
    typeof o.icon === "string" && o.icon.trim() ? o.icon.trim() : undefined;
  const callIdentifier =
    typeof o.callIdentifier === "string" && o.callIdentifier.trim()
      ? o.callIdentifier.trim()
      : undefined;
  return {
    kind,
    id,
    title: String(o.title ?? o.name ?? "").trim() || "(无标题)",
    description:
      typeof o.description === "string" ? o.description.trim() : undefined,
    lastEditTimeLocal: formatLastEditDisplay(
      typeof o.lastEditTimeLocal === "string" ? o.lastEditTimeLocal : undefined,
      o.lastEditTimeUtc,
    ),
    profileName:
      (typeof o.profileName === "string"
        ? o.profileName
        : typeof o.pageTitle === "string"
          ? o.pageTitle
          : undefined)?.trim() || undefined,
    exeFile: typeof o.exeFile === "string" ? o.exeFile.trim() : undefined,
    icon,
    callIdentifier,
    ...(score !== undefined ? { score } : {}),
  };
}

function protoEntryToMention(item: {
  actionId?: string;
  title?: string;
  description?: string;
  lastEditTimeLocal?: string;
  lastEditTimeUtc?: unknown;
  profileName?: string;
  exeFile?: string;
}): ActionMentionItem {
  return {
    kind: "action",
    id: item.actionId?.trim() || "",
    title: item.title?.trim() || "(无标题)",
    description: item.description?.trim() || undefined,
    lastEditTimeLocal: formatLastEditDisplay(
      item.lastEditTimeLocal,
      item.lastEditTimeUtc,
    ),
    profileName: item.profileName?.trim() || undefined,
    exeFile: item.exeFile?.trim() || undefined,
  };
}

/** Parse qkrpc mention-search JSON into composer picker rows. */
export function parseActionMentionItemsFromQkrpcJson(
  parsed: unknown,
  maxItems = 8,
): ActionMentionItem[] {
  const data = unwrapPayload(parsed);
  if (data === null) return [];

  const ordered: ActionMentionItem[] = [];
  const byKey = new Map<string, ActionMentionItem>();

  for (const entry of rawItemsArray(data)) {
    const row = rawEntryToMention(entry);
    if (!row) continue;
    const key = mentionDedupeKey(row.kind ?? "action", row.id);
    if (byKey.has(key)) continue;
    byKey.set(key, row);
    ordered.push(row);
  }
  for (const item of getActionSummaryItems(data)) {
    const id = item.actionId?.trim();
    if (!id) continue;
    const key = mentionDedupeKey("action", id);
    if (byKey.has(key)) continue;
    const row = protoEntryToMention(item);
    byKey.set(key, row);
    ordered.push(row);
  }

  const hasScores = ordered.some((item) => (item.score ?? 0) > 0);
  if (hasScores) {
    ordered.sort((a, b) => {
      const diff = (b.score ?? 0) - (a.score ?? 0);
      if (diff !== 0) return diff;
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    });
  }

  return ordered.slice(0, maxItems);
}

export function formatMentionItemMeta(item: ActionMentionItem): string | undefined {
  const parts: string[] = [];
  if (item.kind === "subprogram") {
    parts.push("公共子程序");
    if (item.callIdentifier) parts.push(item.callIdentifier);
  } else {
    if (item.profileName) parts.push(item.profileName);
    if (item.exeFile) parts.push(item.exeFile);
  }
  if (item.lastEditTimeLocal) parts.push(item.lastEditTimeLocal);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export function formatLastEditUtcForSort(utc: unknown): string | undefined {
  if (utc == null) return undefined;
  if (typeof utc === "string") {
    const n = normalizeUtcIso(utc);
    return n || undefined;
  }
  if (typeof utc === "object" && "seconds" in utc) {
    const sec = Number((utc as { seconds?: number }).seconds ?? 0);
    const ms = sec * 1000 + Number((utc as { nanos?: number }).nanos ?? 0) / 1e6;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  return undefined;
}
