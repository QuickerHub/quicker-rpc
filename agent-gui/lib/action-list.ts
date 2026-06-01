import {
  getActionSummaryItems,
  parseSearchActionSummaries,
  type ActionSummaryItem,
} from "@/lib/agent-api";
import { formatLastEditDisplay } from "@/lib/format-action-time";

export type ActionListRow = {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  lastEditTimeLocal?: string;
  profileName?: string;
  exeFile?: string;
  score?: number;
};

export type ActionListMeta = {
  source: "list" | "search";
  query?: string;
  scope?: string;
  matchCount: number;
};

export type ParsedActionList = {
  meta: ActionListMeta;
  items: ActionListRow[];
};

const ACTION_LIST_TOOLS = new Set(["qkrpc_action_list", "qkrpc_action_search"]);

export function isActionListTool(toolName: string): boolean {
  return ACTION_LIST_TOOLS.has(toolName);
}

function unwrapEnvelope(data: unknown): Record<string, unknown> | null {
  if (typeof data !== "object" || data === null) return null;
  const root = data as Record<string, unknown>;
  if (typeof root.payload === "object" && root.payload !== null) {
    return root.payload as Record<string, unknown>;
  }
  return root;
}

function summaryItemToRow(item: ActionSummaryItem): ActionListRow {
  return {
    id: item.actionId,
    title: item.title?.trim() || "(无标题)",
    description: item.description?.trim() || undefined,
    icon: item.icon?.trim() || undefined,
    lastEditTimeLocal: formatLastEditDisplay(
      item.lastEditTimeLocal,
      item.lastEditTimeUtc,
    ),
    profileName: item.profileName?.trim() || undefined,
    exeFile: item.exeFile?.trim() || undefined,
  };
}

function rawListItemToRow(raw: unknown): ActionListRow | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.actionId ?? o.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    title: String(o.title ?? "").trim() || "(无标题)",
    description:
      typeof o.description === "string" ? o.description.trim() : undefined,
    icon: typeof o.icon === "string" ? o.icon.trim() : undefined,
    lastEditTimeLocal: formatLastEditDisplay(
      typeof o.lastEditTimeLocal === "string" ? o.lastEditTimeLocal : undefined,
      o.lastEditTimeUtc,
    ),
    profileName:
      typeof o.profileName === "string" ? o.profileName.trim() : undefined,
    exeFile: typeof o.exeFile === "string" ? o.exeFile.trim() : undefined,
  };
}

function parseListFromRawPayload(data: unknown): ParsedActionList | null {
  const root = unwrapEnvelope(data);
  if (!root || !Array.isArray(root.items)) return null;
  const items = root.items
    .map(rawListItemToRow)
    .filter((row): row is ActionListRow => row !== null);
  if (items.length === 0) return null;
  return {
    meta: {
      source: "list",
      query: typeof root.query === "string" ? root.query.trim() : undefined,
      scope: typeof root.scope === "string" ? root.scope.trim() : undefined,
      matchCount:
        typeof root.matchCount === "number" ? root.matchCount : items.length,
    },
    items,
  };
}

function searchItemToRow(raw: unknown): ActionListRow | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? o.actionId ?? "").trim();
  if (!id) return null;
  return {
    id,
    title: String(o.title ?? "").trim() || "(无标题)",
    description:
      typeof o.description === "string" ? o.description.trim() : undefined,
    profileName:
      (typeof o.profileName === "string"
        ? o.profileName
        : typeof o.pageTitle === "string"
          ? o.pageTitle
          : undefined)?.trim() || undefined,
    exeFile: typeof o.exeFile === "string" ? o.exeFile.trim() : undefined,
    score: typeof o.score === "number" ? o.score : undefined,
  };
}

/** Parse qkrpc_action_list / qkrpc_action_search tool result data for UI rendering. */
export function parseActionListFromQkrpcData(
  toolName: string,
  data: unknown,
): ParsedActionList | null {
  if (!isActionListTool(toolName)) return null;

  if (toolName === "qkrpc_action_list") {
    const parsed = parseSearchActionSummaries(data);
    if (!parsed) {
      const fromRaw = parseListFromRawPayload(data);
      if (fromRaw) return fromRaw;
      const items = getActionSummaryItems(data).map(summaryItemToRow);
      if (items.length === 0) return null;
      return {
        meta: { source: "list", matchCount: items.length },
        items,
      };
    }
    return {
      meta: {
        source: "list",
        query: parsed.query?.trim() || undefined,
        scope: parsed.scope?.trim() || undefined,
        matchCount: parsed.matchCount ?? parsed.items.length,
      },
      items: parsed.items.map(summaryItemToRow),
    };
  }

  const root = unwrapEnvelope(data);
  if (!root) return null;
  const rawItems = Array.isArray(root.items) ? root.items : [];
  const items = rawItems
    .map(searchItemToRow)
    .filter((row): row is ActionListRow => row !== null);
  const count =
    typeof root.count === "number" ? root.count : items.length;

  return {
    meta: {
      source: "search",
      query: typeof root.query === "string" ? root.query.trim() : undefined,
      scope: typeof root.scope === "string" ? root.scope.trim() : undefined,
      matchCount: count,
    },
    items,
  };
}

export function formatActionListMetaLine(meta: ActionListMeta): string {
  const parts: string[] = [];
  if (meta.query) parts.push(`关键词「${meta.query}」`);
  if (meta.scope) parts.push(`scope=${meta.scope}`);
  parts.push(`${meta.matchCount} 个动作`);
  return parts.join(" · ");
}
