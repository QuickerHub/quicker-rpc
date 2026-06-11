import type { SlashItemKind } from "@/lib/composer-slash-catalog";

export const SLASH_USAGE_STORAGE_KEY = "agent-gui-slash-usage";

export type SlashUsageRecord = {
  count: number;
  lastUsedAt: number;
};

export type SlashUsageMap = Record<string, SlashUsageRecord>;

export function slashUsageKey(kind: SlashItemKind, name: string): string {
  return `${kind}:${name.trim().toLowerCase()}`;
}

export function loadSlashUsageMap(): SlashUsageMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SLASH_USAGE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SlashUsageMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function recordSlashUsage(kind: SlashItemKind, name: string): void {
  if (typeof window === "undefined") return;
  const key = slashUsageKey(kind, name);
  const map = loadSlashUsageMap();
  const prev = map[key];
  map[key] = {
    count: (prev?.count ?? 0) + 1,
    lastUsedAt: Date.now(),
  };
  try {
    localStorage.setItem(SLASH_USAGE_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function topRecentSlashKeys(limit = 5): string[] {
  const map = loadSlashUsageMap();
  return Object.entries(map)
    .sort((a, b) => b[1].lastUsedAt - a[1].lastUsedAt)
    .slice(0, limit)
    .map(([key]) => key);
}
