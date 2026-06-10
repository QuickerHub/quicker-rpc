"use client";

import { useMemo } from "react";

import type { WorkspaceChangedFile } from "@/lib/workspace-explorer-api";
import { basenamePath } from "@/lib/workspace-file-tool";
import {
  useWorkspaceExplorerActions,
  useWorkspaceExplorerEditor,
} from "@/lib/workspace-explorer";

const STATUS_LABEL: Record<WorkspaceChangedFile["status"], string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
  untracked: "U",
  copied: "C",
  type_changed: "T",
  unknown: "?",
};

type ChangedFilesListProps = {
  files: WorkspaceChangedFile[];
  loading: boolean;
  error: string | null;
  notRepo: boolean;
};

export function ChangedFilesList({
  files,
  loading,
  error,
  notRepo,
}: ChangedFilesListProps) {
  const { openFile, openDiff } = useWorkspaceExplorerActions();
  const { activeTab } = useWorkspaceExplorerEditor();

  const sorted = useMemo(
    () => [...files].sort((a, b) => a.path.localeCompare(b.path)),
    [files],
  );

  if (notRepo) {
    return (
      <p className="workspace-explorer-hint">
        当前工作目录不是 Git 仓库，请切换到「全部」查看动作项目。
      </p>
    );
  }

  if (error) {
    return (
      <p className="workspace-explorer-hint workspace-explorer-hint--err">{error}</p>
    );
  }

  if (loading && sorted.length === 0) {
    return <p className="workspace-explorer-hint">正在加载 Git 状态…</p>;
  }

  if (sorted.length === 0) {
    return <p className="workspace-explorer-hint">没有未提交的改动</p>;
  }

  return (
    <ul className="workbench-changed-list">
      {sorted.map((file) => {
        const name = basenamePath(file.path) || file.path;
        const active = activeTab?.path === file.path;
        return (
          <li key={file.path} className="workbench-changed-list__item">
            <button
              type="button"
              className={`workbench-changed-list__row${active ? " workbench-changed-list__row--active" : ""}`}
              title={file.path}
              onClick={() => {
                if (file.status === "deleted") {
                  openDiff(file.path);
                  return;
                }
                openFile(file.path);
              }}
            >
              <span
                className={`workbench-changed-list__badge workbench-changed-list__badge--${file.status}`}
                aria-hidden
              >
                {STATUS_LABEL[file.status]}
              </span>
              <span className="workbench-changed-list__path">
                <span className="workbench-changed-list__name">{name}</span>
                {name !== file.path ? (
                  <span className="workbench-changed-list__dir">
                    {file.path.slice(0, Math.max(0, file.path.length - name.length - 1))}
                  </span>
                ) : null}
              </span>
            </button>
            {file.status !== "untracked" && file.status !== "deleted" ? (
              <button
                type="button"
                className="workbench-changed-list__diff"
                title="查看 Diff"
                aria-label={`查看 ${name} 的 Diff`}
                onClick={() => openDiff(file.path)}
              >
                Diff
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
