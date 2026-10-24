import type { ExplorerFileTab } from "./workspace-explorer";

/** Presentation lifetime only. Editable content remains exclusively in the editor. */
export type WorkspaceDocumentOwner = Readonly<{ key: string; instanceId: number; cwd: string; tabId: string; path: string }>;
export type WorkspaceDocumentInstance = Readonly<{ owner: WorkspaceDocumentOwner; tab: ExplorerFileTab }>;

export function workspaceDocumentKey(cwd: string, tabId: string): string {
  // Do not collapse case on case-sensitive workspaces or conflate path aliases.
  return JSON.stringify([cwd.trim().replace(/\\/g, "/"), tabId]);
}

export function workspaceDocumentPathInProject(path: string, projectPath: string): boolean {
  const normalize = (value: string) => value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  const project = normalize(projectPath);
  const file = normalize(path);
  if (!project || project.split("/").some((part) => part === "." || part === "..")) return false;
  return file === project || file.startsWith(`${project}/`);
}

export function createWorkspaceDocumentInstances() {
  let snapshot: readonly WorkspaceDocumentInstance[] = [];
  let generation = 0;
  let disposed = false;
  const reads = new Map<string, { path: string; token: object }>();
  const listeners = new Set<() => void>();
  const emit = () => { for (const listener of listeners) listener(); };
  const isCurrent = (owner: WorkspaceDocumentOwner) => snapshot.some((item) => item.owner === owner);
  const update = (owner: WorkspaceDocumentOwner, tab: ExplorerFileTab) => {
    if (!isCurrent(owner) || tab.id !== owner.tabId || tab.path !== owner.path) return false;
    const previous = snapshot.find((item) => item.owner === owner)!;
    if (previous.tab === tab) return true;
    // Restoring a tab or a failed background read must not unmount its dirty editor.
    const nextTab = !tab.content && (tab.loading || tab.error) && previous.tab.content
      ? { ...tab, content: previous.tab.content, truncated: previous.tab.truncated, totalChars: previous.tab.totalChars }
      : tab;
    snapshot = snapshot.map((item) => item.owner === owner ? { owner, tab: nextTab } : item);
    emit();
    return true;
  };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    isCurrent,
    beginRead(cwd: string, tabId: string, path: string, owner?: WorkspaceDocumentOwner) {
      const key = workspaceDocumentKey(cwd, tabId), token = {};
      if (!disposed && (!owner || isCurrent(owner))) reads.set(key, { path, token });
      const current = () => !disposed && reads.get(key)?.token === token && (!owner || isCurrent(owner));
      return {
        isCurrent: current,
        publish(run: () => void) { if (!current()) return false; run(); return true; },
      };
    },
    invalidateRead(cwd: string, tabId: string) { reads.delete(workspaceDocumentKey(cwd, tabId)); },
    visit(cwd: string, tab: ExplorerFileTab) {
      if (disposed) throw new Error("Workspace document host has been disposed");
      const key = workspaceDocumentKey(cwd, tab.id);
      const existing = snapshot.find((item) => item.owner.key === key);
      if (existing) { update(existing.owner, tab); return existing.owner; }
      const owner = Object.freeze({ key, instanceId: ++generation, cwd: cwd.trim(), tabId: tab.id, path: tab.path });
      snapshot = [...snapshot, { owner, tab }];
      emit();
      return owner;
    },
    update,
    observe(cwd: string, tabs: readonly ExplorerFileTab[]) {
      for (const item of snapshot) {
        if (workspaceDocumentKey(cwd, item.owner.tabId) !== item.owner.key) continue;
        const tab = tabs.find((candidate) => candidate.id === item.owner.tabId);
        if (tab) update(item.owner, tab);
      }
    },
    close(cwd: string, tabId: string) {
      const key = workspaceDocumentKey(cwd, tabId);
      reads.delete(key);
      const next = snapshot.filter((item) => item.owner.key !== key);
      if (next.length !== snapshot.length) { snapshot = next; emit(); }
    },
    closeWorkspace(cwd: string) {
      for (const key of reads.keys()) {
        const [, tabId] = JSON.parse(key) as [string, string];
        if (workspaceDocumentKey(cwd, tabId) === key) reads.delete(key);
      }
      const next = snapshot.filter((item) => workspaceDocumentKey(cwd, item.owner.tabId) !== item.owner.key);
      if (next.length !== snapshot.length) { snapshot = next; emit(); }
    },
    closeProject(cwd: string, projectPath: string) {
      for (const [key, read] of reads) {
        const [, tabId] = JSON.parse(key) as [string, string];
        if (workspaceDocumentKey(cwd, tabId) === key && workspaceDocumentPathInProject(read.path, projectPath)) reads.delete(key);
      }
      const next = snapshot.filter((item) => workspaceDocumentKey(cwd, item.owner.tabId) !== item.owner.key
        || !workspaceDocumentPathInProject(item.owner.path, projectPath));
      if (next.length !== snapshot.length) { snapshot = next; emit(); }
    },
    dispose() { disposed = true; reads.clear(); if (snapshot.length) { snapshot = []; emit(); } },
  };
}

export type WorkspaceDocumentInstances = ReturnType<typeof createWorkspaceDocumentInstances>;

/** A departing Chat's cleanup cannot unregister the newly visible outlet. */
export function createWorkspaceDocumentPresentation<T>() {
  let current: { token: object; value: T } | null = null;
  return {
    getCurrent: () => current,
    register(token: object, value: T) { current = { token, value }; },
    release(token: object) { if (current?.token === token) current = null; },
  };
}

/** Exact owner, including a reopened file's generation, gates every late receipt. */
export async function runWorkspaceDocumentStorage<T>(
  instances: WorkspaceDocumentInstances,
  owner: WorkspaceDocumentOwner,
  run: (cwd: string, path: string) => Promise<T>,
): Promise<T | undefined> {
  if (!instances.isCurrent(owner)) return undefined;
  const result = await run(owner.cwd, owner.path);
  return instances.isCurrent(owner) ? result : undefined;
}
