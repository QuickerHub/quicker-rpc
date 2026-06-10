"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchWorkspaceGitStatus,
  type WorkspaceChangedFile,
} from "@/lib/workspace-explorer-api";

export type WorkspaceGitStatusState = {
  loading: boolean;
  error: string | null;
  notRepo: boolean;
  changedFiles: WorkspaceChangedFile[];
};

const EMPTY_STATUS: WorkspaceGitStatusState = {
  loading: false,
  error: null,
  notRepo: false,
  changedFiles: [],
};

export function useWorkspaceGitStatus(
  cwd: string,
  refreshKey: number,
): WorkspaceGitStatusState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<WorkspaceGitStatusState>(EMPTY_STATUS);

  const refresh = useCallback(async () => {
    const trimmed = cwd.trim();
    if (!trimmed) {
      setState(EMPTY_STATUS);
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));
    const result = await fetchWorkspaceGitStatus(trimmed);
    if (!result.ok) {
      setState({
        loading: false,
        error: result.error,
        notRepo: false,
        changedFiles: [],
      });
      return;
    }

    setState({
      loading: false,
      error: result.state === "error" ? (result.error ?? "Git 状态加载失败") : null,
      notRepo: result.state === "not-repo",
      changedFiles: result.changedFiles,
    });
  }, [cwd]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  return { ...state, refresh };
}
