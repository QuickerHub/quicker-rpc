import type { ChatStoreData, ChatThread } from "@/lib/chat-store";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export type ChatWorkspace = {
  id: string;
  /** Empty = server default cwd (dev repo / Documents workspace). */
  rootPath: string;
  /** Optional display label; otherwise derived from rootPath or "默认". */
  label?: string;
};

export function createWorkspace(rootPath = "", label?: string): ChatWorkspace {
  return {
    id: newId(),
    rootPath: rootPath.trim(),
    label: label?.trim() || undefined,
  };
}

export function defaultWorkspaceLabel(
  workspace: Pick<ChatWorkspace, "rootPath" | "label">,
  defaultCwdLabel = "默认",
): string {
  if (workspace.label?.trim()) return workspace.label.trim();
  const path = workspace.rootPath.trim();
  if (!path) return defaultCwdLabel;
  const normalized = path.replace(/\\/g, "/");
  const base = normalized.split("/").filter(Boolean).pop();
  return base || path;
}

export function getWorkspaceById(
  data: Pick<ChatStoreData, "workspaces">,
  workspaceId: string,
): ChatWorkspace | undefined {
  const workspaces = Array.isArray(data.workspaces) ? data.workspaces : [];
  return workspaces.find((ws) => ws.id === workspaceId);
}

export function getActiveWorkspace(
  data: Pick<ChatStoreData, "workspaces" | "activeWorkspaceId">,
): ChatWorkspace {
  const workspaces = Array.isArray(data.workspaces) ? data.workspaces : [];
  const activeWorkspaceId =
    typeof data.activeWorkspaceId === "string" ? data.activeWorkspaceId : "";
  return (
    getWorkspaceById({ workspaces }, activeWorkspaceId)
    ?? workspaces[0]
    ?? createWorkspace()
  );
}

/** Migrate legacy single workingDirectory into workspaces[]. */
export function ensureWorkspacesMigrated(data: ChatStoreData): ChatStoreData {
  const workspaces = Array.isArray(data.workspaces) ? data.workspaces : [];
  const activeWorkspaceId =
    typeof data.activeWorkspaceId === "string" ? data.activeWorkspaceId : "";
  const base =
    workspaces === data.workspaces && activeWorkspaceId === data.activeWorkspaceId
      ? data
      : { ...data, workspaces, activeWorkspaceId };

  if (base.workspaces.length > 0 && base.activeWorkspaceId) {
    const active = getWorkspaceById(base, base.activeWorkspaceId);
    if (active) {
      const threads = base.threads.map((thread) => ({
        ...thread,
        workspaceId: thread.workspaceId ?? base.activeWorkspaceId,
      }));
      return threads.every((t, i) => t.workspaceId === base.threads[i]?.workspaceId)
        ? base
        : { ...base, threads };
    }
  }

  const legacyPath = base.workingDirectory.trim();
  const workspace = createWorkspace(legacyPath);
  const threads = base.threads.map((thread) => ({
    ...thread,
    workspaceId: thread.workspaceId ?? workspace.id,
  }));

  return {
    ...base,
    workspaces: [workspace],
    activeWorkspaceId: workspace.id,
    threads,
    workingDirectory: legacyPath,
  };
}

export function threadsForWorkspace(
  threads: ChatThread[],
  workspaceId: string,
): ChatThread[] {
  return threads.filter((thread) => thread.workspaceId === workspaceId);
}

export function resolveThreadWorkingDirectory(
  thread: Pick<ChatThread, "workspaceId">,
  store: Pick<ChatStoreData, "workspaces" | "workingDirectory">,
  defaultCwd = "",
): string {
  const workspace = thread.workspaceId
    ? getWorkspaceById(store, thread.workspaceId)
    : undefined;
  const rootPath = workspace?.rootPath.trim() || store.workingDirectory.trim();
  return rootPath || defaultCwd.trim();
}

/** Point threads at a known workspace after legacy import (stale v1 workspace ids). */
export function remapThreadsToKnownWorkspaces(data: ChatStoreData): ChatStoreData {
  const known = new Set(data.workspaces.map((ws) => ws.id));
  const fallback = data.activeWorkspaceId || data.workspaces[0]?.id || "";
  if (!fallback) return data;

  let changed = false;
  const threads = data.threads.map((thread) => {
    if (thread.workspaceId && known.has(thread.workspaceId)) return thread;
    changed = true;
    return { ...thread, workspaceId: fallback };
  });

  return changed ? { ...data, threads } : data;
}

export function syncLegacyWorkingDirectory(data: ChatStoreData): ChatStoreData {
  const active = getActiveWorkspace(data);
  const legacy = data.workingDirectory.trim();
  if (legacy === active.rootPath.trim()) return data;
  return { ...data, workingDirectory: active.rootPath };
}
