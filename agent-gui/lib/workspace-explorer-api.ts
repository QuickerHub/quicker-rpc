import type { ActionExplorerTree } from "@/lib/action-explorer-tree";
import {
  fetchWorkspaceFileCached,
  invalidateWorkspaceFileReadCache,
} from "@/lib/workspace-file-read-cache";
import type {
  WorkspaceChangedFile,
  WorkspaceGitDiffResult,
  WorkspaceGitStatusResult,
} from "@/lib/workspace-git.server";

export type ActionExplorerWatchHandlers = {
  onTree: (tree: ActionExplorerTree, subprogramTree: ActionExplorerTree) => void;
  onError: (error: string) => void;
};

export type WorkspaceExplorerTrees = {
  tree: ActionExplorerTree;
  subprogramTree: ActionExplorerTree;
};

export type WorkspaceReadResponse = {
  ok: true;
  path: string;
  content: string;
  truncated: boolean;
  totalChars?: number;
};

export type FetchActionExplorerTreeOptions = {
  /** roots: project folders only; full: complete file tree (default). */
  depth?: "roots" | "full";
};

export async function fetchActionExplorerTree(
  cwd: string,
  options?: FetchActionExplorerTreeOptions,
): Promise<
  { ok: true; tree: ActionExplorerTree; subprogramTree: ActionExplorerTree }
  | { ok: false; error: string }
> {
  const params = new URLSearchParams({ op: "tree", cwd });
  if (options?.depth === "roots") {
    params.set("depth", "roots");
  }
  const res = await fetch(`/api/workspace?${params}`, { cache: "no-store" });
  const data = (await res.json()) as {
    ok: boolean;
    tree?: ActionExplorerTree;
    subprogramTree?: ActionExplorerTree;
    error?: string;
  };
  if (!data.ok || !data.tree || !data.subprogramTree) {
    return { ok: false, error: data.error ?? "Failed to load explorer tree" };
  }
  return { ok: true, tree: data.tree, subprogramTree: data.subprogramTree };
}

/** Live explorer tree via filesystem watch (SSE). */
export function subscribeActionExplorerTreeWatch(
  cwd: string,
  handlers: ActionExplorerWatchHandlers,
): () => void {
  const trimmed = cwd.trim();
  if (!trimmed) {
    handlers.onError("未设置工作目录");
    return () => {};
  }

  const params = new URLSearchParams({ cwd: trimmed });
  const source = new EventSource(`/api/workspace/watch?${params}`);

  source.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as {
        ok?: boolean;
        type?: string;
        tree?: ActionExplorerTree;
        subprogramTree?: ActionExplorerTree;
        error?: string;
      };
      if (data.ok && data.tree && data.subprogramTree) {
        handlers.onTree(data.tree, data.subprogramTree);
        return;
      }
      if (data.ok === false && data.error) {
        handlers.onError(data.error);
      }
    } catch {
      handlers.onError("Invalid explorer watch payload");
    }
  };

  source.onerror = () => {
    handlers.onError("资源管理器实时连接中断，正在重试…");
  };

  return () => {
    source.close();
  };
}

export function formatWorkspaceFetchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("fetch failed") || message.includes("Failed to fetch")) {
    return "无法连接工作区 API（请确认 agent-gui 开发服务未在重载中）";
  }
  return message || "Failed to read file";
}

export type WorkspaceListResponse = {
  ok: true;
  path: string;
  entries: { path: string; kind: "file" | "directory"; sizeBytes?: number }[];
  truncated: boolean;
};

export async function fetchWorkspaceFileList(
  cwd: string,
  path: string,
  options?: { recursive?: boolean },
): Promise<WorkspaceListResponse | { ok: false; error: string }> {
  try {
    const params = new URLSearchParams({ op: "list", cwd, path });
    if (options?.recursive) {
      params.set("recursive", "true");
    }
    const res = await fetch(`/api/workspace?${params}`, { cache: "no-store" });
    const data = (await res.json()) as WorkspaceListResponse & {
      ok: boolean;
      error?: string;
    };
    if (!data.ok) {
      return { ok: false, error: data.error ?? "Failed to list files" };
    }
    return data;
  } catch (error) {
    return { ok: false, error: formatWorkspaceFetchError(error) };
  }
}

export async function fetchWorkspaceFile(
  cwd: string,
  path: string,
): Promise<WorkspaceReadResponse | { ok: false; error: string }> {
  return fetchWorkspaceFileCached(cwd, path, async () => {
    try {
      const params = new URLSearchParams({ op: "read", cwd, path });
      const res = await fetch(`/api/workspace?${params}`, { cache: "no-store" });
      const data = (await res.json()) as WorkspaceReadResponse & {
        ok: boolean;
        error?: string;
      };
      if (!data.ok) {
        return { ok: false, error: data.error ?? "Failed to read file" };
      }
      return data;
    } catch (error) {
      return { ok: false, error: formatWorkspaceFetchError(error) };
    }
  });
}

export async function deleteActionProjectApi(
  cwd: string,
  projectPath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "delete-project", cwd, projectPath }),
    cache: "no-store",
  });
  const data = (await res.json()) as { ok: boolean; error?: string };
  if (!data.ok) {
    return { ok: false, error: data.error ?? "Failed to delete project" };
  }
  return { ok: true };
}

export async function fetchWorkspaceGitStatus(
  cwd: string,
): Promise<
  | ({ ok: true } & WorkspaceGitStatusResult)
  | { ok: false; error: string }
> {
  try {
    const params = new URLSearchParams({ op: "git-status", cwd });
    const res = await fetch(`/api/workspace?${params}`, { cache: "no-store" });
    const data = (await res.json()) as { ok: boolean; error?: string }
      & WorkspaceGitStatusResult;
    if (!data.ok) {
      return { ok: false, error: data.error ?? "Failed to load git status" };
    }
    const changedFiles = data.changedFiles ?? [];
    switch (data.state) {
      case "ok":
        return { ok: true, state: "ok", changedFiles };
      case "not-repo":
        return { ok: true, state: "not-repo", changedFiles, error: data.error };
      case "error":
        return {
          ok: true,
          state: "error",
          changedFiles,
          error: data.error ?? "Git status failed",
        };
    }
  } catch (error) {
    return { ok: false, error: formatWorkspaceFetchError(error) };
  }
}

export async function fetchWorkspaceDiff(
  cwd: string,
  path: string,
): Promise<
  | ({ ok: true } & WorkspaceGitDiffResult)
  | { ok: false; error: string }
> {
  try {
    const params = new URLSearchParams({ op: "diff", cwd, path });
    const res = await fetch(`/api/workspace?${params}`, { cache: "no-store" });
    const data = (await res.json()) as { ok: boolean; error?: string }
      & WorkspaceGitDiffResult;
    if (!data.ok) {
      return { ok: false, error: data.error ?? "Failed to load diff" };
    }
    const diff = data.diff ?? "";
    switch (data.state) {
      case "ok":
        return { ok: true, state: "ok", diff };
      case "not-repo":
        return { ok: true, state: "not-repo", diff, error: data.error };
      case "error":
        return {
          ok: true,
          state: "error",
          diff,
          error: data.error ?? "Failed to load diff",
        };
    }
  } catch (error) {
    return { ok: false, error: formatWorkspaceFetchError(error) };
  }
}

export type { WorkspaceChangedFile };

export async function writeWorkspaceFileApi(
  cwd: string,
  path: string,
  content: string,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const res = await fetch("/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "write", cwd, path, content }),
    cache: "no-store",
  });
  const data = (await res.json()) as { ok: boolean; path?: string; error?: string };
  if (!data.ok) {
    return { ok: false, error: data.error ?? "Failed to write file" };
  }
  invalidateWorkspaceFileReadCache(cwd, data.path ?? path);
  return { ok: true, path: data.path ?? path };
}
