import type { ChatThread } from "@/lib/chat-store";
import { sortThreads } from "@/lib/chat-store";

/** Normalize cwd for grouping (case-insensitive, forward slashes). */
export function normalizeCwdKey(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** Display label for a cwd group (folder basename or default label). */
export function cwdGroupLabel(path: string, defaultLabel: string): string {
  const trimmed = path.trim();
  if (!trimmed) return defaultLabel;
  const normalized = trimmed.replace(/\\/g, "/").replace(/\/+$/, "");
  const base = normalized.split("/").filter(Boolean).pop();
  return base || trimmed;
}

/** Display label for the server default workspace (folder name + 默认). */
export function defaultCwdGroupLabel(defaultCwd: string): string {
  const folder = cwdGroupLabel(defaultCwd, "默认");
  if (!defaultCwd.trim() || folder === "默认") return "默认";
  return `${folder}（默认）`;
}

export type CwdThreadGroup = {
  key: string;
  /** Stored cwd on threads in this group (empty = server default). */
  path: string;
  label: string;
  threads: ChatThread[];
  latestUpdatedAt: number;
};

export function groupThreadsByCwd(
  threads: ChatThread[],
  defaultLabel: string,
): CwdThreadGroup[] {
  const map = new Map<string, ChatThread[]>();
  for (const thread of threads) {
    const key = normalizeCwdKey(thread.workingDirectory ?? "");
    const list = map.get(key) ?? [];
    list.push(thread);
    map.set(key, list);
  }

  const groups: CwdThreadGroup[] = [];
  for (const [key, groupThreads] of map) {
    const sorted = sortThreads(groupThreads);
    const path = sorted[0]?.workingDirectory?.trim() ?? "";
    groups.push({
      key,
      path,
      label: cwdGroupLabel(path, defaultLabel),
      threads: sorted,
      latestUpdatedAt: sorted[0]?.updatedAt ?? 0,
    });
  }

  groups.sort((a, b) => b.latestUpdatedAt - a.latestUpdatedAt);
  return groups;
}

/** Relative time label for sidebar thread rows (Chinese, Codex-style). */
export function formatThreadRelativeTime(updatedAt: number, nowMs = Date.now()): string {
  const diff = Math.max(0, nowMs - updatedAt);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} 周`;
  const months = Math.floor(days / 30);
  return `${months} 月`;
}

export const SIDEBAR_THREADS_VISIBLE_PER_GROUP = 5;

const COLLAPSED_GROUPS_STORAGE_KEY = "agent-gui-sidebar-cwd-collapsed";

export function readCollapsedCwdGroups(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(COLLAPSED_GROUPS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

export function writeCollapsedCwdGroups(collapsed: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      COLLAPSED_GROUPS_STORAGE_KEY,
      JSON.stringify([...collapsed]),
    );
  } catch {
    /* ignore quota */
  }
}
