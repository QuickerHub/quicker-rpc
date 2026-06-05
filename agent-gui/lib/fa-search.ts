import { isStructuredToolResult } from "@/lib/tool-result";

export type FaSearchMeta = {
  keyword?: string;
  matchCount: number;
  defaultStyle?: string;
};

export type ParsedFaSearch = {
  meta: FaSearchMeta;
  names: string[];
};

export function isFaSearchTool(toolName: string, input?: unknown): boolean {
  if (toolName === "qkrpc_fa_search") return true;
  if (toolName !== "qkrpc_fa") return false;
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    const action = (input as Record<string, unknown>).action;
    return action === "search" || action === undefined;
  }
  return false;
}

function unwrapPayload(data: unknown): Record<string, unknown> | null {
  if (typeof data !== "object" || data === null) return null;
  const root = data as Record<string, unknown>;
  if (typeof root.payload === "object" && root.payload !== null) {
    return root.payload as Record<string, unknown>;
  }
  return root;
}

function readString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}

function readBool(obj: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

function readInt(obj: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

export function faEnumNameToSpec(enumName: string): string {
  const trimmed = enumName.trim();
  return trimmed.startsWith("fa:") ? trimmed : `fa:${trimmed}`;
}

/** Display label after style prefix, e.g. Light_Barcode → Barcode */
export function faDisplayLabel(enumName: string): string {
  const trimmed = enumName.trim();
  const idx = trimmed.indexOf("_");
  if (idx > 0 && idx < trimmed.length - 1) {
    return trimmed.slice(idx + 1);
  }
  return trimmed;
}

export function faStylePrefix(enumName: string): string | undefined {
  const trimmed = enumName.trim();
  const idx = trimmed.indexOf("_");
  if (idx <= 0) return undefined;
  return trimmed.slice(0, idx);
}

export function formatFaSearchMetaLine(meta: FaSearchMeta): string {
  const parts: string[] = [];
  if (meta.keyword) parts.push(`「${meta.keyword}」`);
  parts.push(`${meta.matchCount} 个图标`);
  return parts.join(" · ");
}

/** One fa spec per line for tool cards and copy-friendly display. */
export function formatFaSearchPlainText(names: string[]): string {
  return names.map(faEnumNameToSpec).join("\n");
}

export function parseFaSearchFromQkrpcData(data: unknown): ParsedFaSearch | null {
  const payload = unwrapPayload(data);
  if (!payload) return null;

  const action = readString(payload, "action");
  if (action && action !== "fa-search") return null;

  const success = readBool(payload, "success", "Success", "ok");
  if (success === false) return null;

  const namesRaw = payload.names ?? payload.Names;
  if (!Array.isArray(namesRaw)) return null;

  const names = namesRaw
    .filter((n): n is string => typeof n === "string")
    .map((n) => n.trim())
    .filter(Boolean);

  const matchCount =
    readInt(payload, "matchCount", "MatchCount") ?? names.length;

  return {
    meta: {
      keyword: readString(payload, "keyword", "Keyword", "query", "Query"),
      matchCount,
      defaultStyle: readString(payload, "defaultStyle", "DefaultStyle"),
    },
    names,
  };
}

export function parseFaSearchFromToolOutput(output: unknown): ParsedFaSearch | null {
  if (!isStructuredToolResult(output) || !output.ok) return null;
  return parseFaSearchFromQkrpcData(output.data);
}
