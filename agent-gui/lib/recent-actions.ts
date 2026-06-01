import type { ActionSummaryItem } from "@/lib/agent-api";
import { getActionSummaryItems } from "@/lib/agent-api";
import {
  formatLastEditDisplay,
  normalizeUtcIso,
} from "@/lib/format-action-time";
import type { PinnedAction } from "@/lib/action-context";

export type RecentActionItem = PinnedAction & { lastEditTimeUtc?: string };

const DEFAULT_RECENT_LIMIT = 3;

function summaryToRecent(item: ActionSummaryItem): RecentActionItem {
  return {
    id: item.actionId,
    title: item.title?.trim() || "(无标题)",
    description: item.description?.trim() || undefined,
    lastEditTimeUtc: formatLastEditUtcForSort(item.lastEditTimeUtc),
    lastEditTimeLocal: formatLastEditDisplay(
      item.lastEditTimeLocal,
      item.lastEditTimeUtc,
    ),
  };
}

function formatLastEditUtcForSort(utc: unknown): string | undefined {
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

function editSortKey(item: RecentActionItem): number {
  const utc = item.lastEditTimeUtc;
  if (!utc) return 0;
  const ms = Date.parse(utc);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Newest first; stable tie-break on title. */
export function sortRecentByLastEdit(items: RecentActionItem[]): RecentActionItem[] {
  return [...items].sort((a, b) => {
    const diff = editSortKey(b) - editSortKey(a);
    if (diff !== 0) return diff;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

/** Parse qkrpc action list JSON (CLI envelope or tool-shaped body). */
export function parseRecentActionsFromQkrpcJson(
  parsed: unknown,
  maxItems = DEFAULT_RECENT_LIMIT,
): RecentActionItem[] {
  const data = unwrapListData(parsed);
  if (data === null) return [];

  const raw = rawItemsArray(data);
  const fromRaw = raw
    .map((entry) => rawEntryToRecent(entry))
    .filter((row): row is RecentActionItem => row !== null);

  const fromProto = getActionSummaryItems(data).map(summaryToRecent);

  const byId = new Map<string, RecentActionItem>();
  for (const row of [...fromRaw, ...fromProto]) {
    const prev = byId.get(row.id);
    if (!prev || editSortKey(row) >= editSortKey(prev)) {
      byId.set(row.id, row);
    }
  }

  return sortRecentByLastEdit([...byId.values()]).slice(0, maxItems);
}

function unwrapListData(parsed: unknown): unknown {
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

function rawEntryToRecent(raw: unknown): RecentActionItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.actionId ?? o.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    title: String(o.title ?? "").trim() || "(无标题)",
    description:
      typeof o.description === "string" ? o.description.trim() : undefined,
    lastEditTimeUtc: formatLastEditUtcForSort(o.lastEditTimeUtc),
    lastEditTimeLocal: formatLastEditDisplay(
      typeof o.lastEditTimeLocal === "string" ? o.lastEditTimeLocal : undefined,
      o.lastEditTimeUtc,
    ),
  };
}
