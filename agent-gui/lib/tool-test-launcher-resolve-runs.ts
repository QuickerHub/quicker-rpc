import type { LauncherResolveCandidate } from "@/lib/launcher/launcher-resolve-presets";

export type LauncherResolveRunStatus = "running" | "done" | "error";

export type LauncherResolveRunEntry = {
  id: string;
  at: number;
  triggerLabel?: string;
  query: string;
  status: LauncherResolveRunStatus;
  candidates?: LauncherResolveCandidate[];
  topTitle?: string;
  topKind?: string;
  suggestedTool?: string;
  error?: string;
};

export function createLauncherResolveRunId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `launcher-resolve-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function formatLauncherResolveRunTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
