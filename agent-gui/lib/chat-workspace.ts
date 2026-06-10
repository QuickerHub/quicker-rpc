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
  return data.workspaces.find((ws) => ws.id === workspaceId);
}

export function getActiveWorkspace(
  data: Pick<ChatStoreData, "workspaces" | "activeWorkspaceId">,
): ChatWorkspace {
  return (
    getWorkspaceById(data, data.activeWorkspaceId)
    ?? data.workspaces[0]
    ?? createWorkspace()
  );
}

/** Migrate legacy single workingDirectory into workspaces[]. */
export function ensureWorkspacesMigrated(data: ChatStoreData): ChatStoreData {
  if (data.workspaces.length > 0 && data.activeWorkspaceId) {
    const active = getWorkspaceById(data, data.activeWorkspaceId);
    if (active) {
      const threads = data.threads.map((thread) => ({
        ...thread,
        workspaceId: thread.workspaceId ?? data.activeWorkspaceId,
      }));
      return threads.every((t, i) => t.workspaceId === data.threads[i]?.workspaceId)
        ? data
        : { ...data, threads };
    }
  }

  const legacyPath = data.workingDirectory.trim();
  const workspace = createWorkspace(legacyPath);
  const threads = data.threads.map((thread) => ({
    ...thread,
    workspaceId: thread.workspaceId ?? workspace.id,
  }));

  return {
    ...data,
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

export function syncLegacyWorkingDirectory(data: ChatStoreData): ChatStoreData {
  const active = getActiveWorkspace(data);
  const legacy = data.workingDirectory.trim();
  if (legacy === active.rootPath.trim()) return data;
  return { ...data, workingDirectory: active.rootPath };
}
