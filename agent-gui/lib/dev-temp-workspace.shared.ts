import { cwdGroupLabel } from "@/lib/thread-cwd-groups";

/** Relative segment under agent-gui root for dev-only scratch workspaces. */
export const DEV_TEMP_WORKSPACE_REL_DIR = ".local/temp-workspaces";

export function normalizePathForCompare(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function isDevTempWorkspacePath(path: string): boolean {
  const normalized = normalizePathForCompare(path);
  if (!normalized) return false;
  return normalized.includes(`/${DEV_TEMP_WORKSPACE_REL_DIR.replace(/\\/g, "/").toLowerCase()}/`);
}

export function devTempWorkspaceSidebarLabel(path: string): string {
  const base = cwdGroupLabel(path, "scratch");
  return `临时 · ${base}`;
}

export type DevTempWorkspaceSeed = "eval-workspace" | "empty";

export type DevTempWorkspaceCleanupResult = {
  path: string;
  deletedActions: string[];
  deletedSubprograms: string[];
  errors: string[];
};
