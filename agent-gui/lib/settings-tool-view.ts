import { isStructuredToolResult } from "@/lib/tool-result";

export const QUICKER_SETTINGS_TOOL = "quicker_settings";

const LEGACY_SETTINGS_TOOLS = new Set([
  QUICKER_SETTINGS_TOOL,
  "qkrpc_settings_search",
  "qkrpc_settings_list",
  "qkrpc_settings_get",
  "qkrpc_settings_set",
  "qkrpc_settings_pages",
  "qkrpc_settings_open",
]);

export type SettingsListItem = {
  key: string;
  scope?: string;
  title?: string;
  snippet?: string;
  description?: string;
  type?: string;
  writable?: boolean;
  pageId?: string;
  pageTitle?: string;
};

export type SettingsPageItem = {
  pageId: string;
  title?: string;
};

export type SettingsListResultView = {
  query?: string;
  scope?: string;
  items: SettingsListItem[];
  pages: SettingsPageItem[];
  message?: string;
};

export type SettingsGetResultView = {
  key: string;
  scope?: string;
  value?: string;
  type?: string;
  title?: string;
  description?: string;
};

function readQkrpcData(output: unknown): Record<string, unknown> | null {
  if (!isStructuredToolResult(output) || !output.ok) return null;
  const data = output.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  return data as Record<string, unknown>;
}

function parseListItem(raw: unknown): SettingsListItem | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const key = typeof row.Key === "string"
    ? row.Key
    : typeof row.key === "string"
      ? row.key
      : "";
  if (!key.trim()) return null;
  return {
    key: key.trim(),
    scope:
      typeof row.Scope === "string"
        ? row.Scope
        : typeof row.scope === "string"
          ? row.scope
          : undefined,
    title:
      typeof row.Title === "string"
        ? row.Title
        : typeof row.title === "string"
          ? row.title
          : undefined,
    snippet:
      typeof row.Snippet === "string"
        ? row.Snippet
        : typeof row.snippet === "string"
          ? row.snippet
          : undefined,
    description:
      typeof row.Description === "string"
        ? row.Description
        : typeof row.description === "string"
          ? row.description
          : undefined,
    type:
      typeof row.Type === "string"
        ? row.Type
        : typeof row.type === "string"
          ? row.type
          : undefined,
    writable:
      typeof row.Writable === "boolean"
        ? row.Writable
        : typeof row.writable === "boolean"
          ? row.writable
          : undefined,
    pageId:
      typeof row.PageId === "string"
        ? row.PageId
        : typeof row.pageId === "string"
          ? row.pageId
          : undefined,
    pageTitle:
      typeof row.PageTitle === "string"
        ? row.PageTitle
        : typeof row.pageTitle === "string"
          ? row.pageTitle
          : undefined,
  };
}

function parsePageItem(raw: unknown): SettingsPageItem | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const pageId =
    typeof row.PageId === "string"
      ? row.PageId
      : typeof row.pageId === "string"
        ? row.pageId
        : "";
  if (!pageId.trim()) return null;
  return {
    pageId: pageId.trim(),
    title:
      typeof row.Title === "string"
        ? row.Title
        : typeof row.title === "string"
          ? row.title
          : undefined,
  };
}

export function parseSettingsListResultView(
  output: unknown,
): SettingsListResultView | null {
  const data = readQkrpcData(output);
  if (!data || data.action !== "settings-list") return null;
  const items = Array.isArray(data.items)
    ? data.items
        .map(parseListItem)
        .filter((item): item is SettingsListItem => item !== null)
    : [];
  const pages = Array.isArray(data.pages)
    ? data.pages
        .map(parsePageItem)
        .filter((page): page is SettingsPageItem => page !== null)
    : [];
  return {
    query: typeof data.query === "string" ? data.query : undefined,
    scope: typeof data.scope === "string" ? data.scope : undefined,
    items,
    pages,
    message: typeof data.message === "string" ? data.message : undefined,
  };
}

export function parseSettingsGetResultView(
  output: unknown,
): SettingsGetResultView | null {
  const data = readQkrpcData(output);
  if (!data || data.action !== "settings-get") return null;
  const key =
    typeof data.key === "string"
      ? data.key
      : typeof data.Key === "string"
        ? data.Key
        : "";
  if (!key.trim()) return null;
  const value =
    typeof data.value === "string"
      ? data.value
      : typeof data.Value === "string"
        ? data.Value
        : data.value != null
          ? JSON.stringify(data.value)
          : undefined;
  return {
    key: key.trim(),
    scope: typeof data.scope === "string" ? data.scope : undefined,
    value,
    type: typeof data.type === "string" ? data.type : undefined,
    title: typeof data.title === "string" ? data.title : undefined,
    description:
      typeof data.description === "string" ? data.description : undefined,
  };
}

export function settingsToolHasPopupVisual(
  toolName: string,
  input: unknown,
  output: unknown,
): boolean {
  if (!LEGACY_SETTINGS_TOOLS.has(toolName)) return false;
  if (parseSettingsListResultView(output)) return true;
  if (parseSettingsGetResultView(output)) return true;
  if (isStructuredToolResult(output) && !output.ok) return true;
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    const action = (input as Record<string, unknown>).action;
    return action === "search" || action === "list" || action === "get";
  }
  return toolName !== QUICKER_SETTINGS_TOOL;
}
