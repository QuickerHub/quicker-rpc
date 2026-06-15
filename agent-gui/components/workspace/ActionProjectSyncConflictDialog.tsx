"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { ActionProjectSyncStatus } from "@/lib/action-project-sync-types";

export type ActionProjectSyncConflictDialogProps = {
  open: boolean;
  status: ActionProjectSyncStatus | null;
  busy?: boolean;
  onCancel: () => void;
  onUseWorkspace: () => void;
  onUseQuicker: () => void;
};

function versionLabel(kind: "local" | "remote", status: ActionProjectSyncStatus): string {
  const version =
    kind === "local" ? status.localEditVersion : status.remoteEditVersion;
  const prefix = kind === "local" ? "工作区" : "Quicker";
  return version != null ? `${prefix} v${version}` : `${prefix} 无版本`;
}

export function ActionProjectSyncConflictDialog({
  open,
  status,
  busy = false,
  onCancel,
  onUseWorkspace,
  onUseQuicker,
}: ActionProjectSyncConflictDialogProps) {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel, open]);

  if (!open || !status || typeof document === "undefined") {
    return null;
  }

  const remoteTitle = status.remoteTitle?.trim();

  return createPortal(
    <div
      className="action-project-sync-conflict-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onCancel();
        }
      }}
    >
      <div
        className="action-project-sync-conflict-dialog composer-popup"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="action-project-sync-conflict-header">
          <h2 id={titleId}>同步冲突</h2>
        </header>
        <div className="action-project-sync-conflict-body">
          <p id={descId} className="action-project-sync-conflict-desc">
            工作区与 Quicker 均有未同步的变更，无法自动合并。请选择保留哪一侧的版本（另一侧将被覆盖）。
          </p>
          <dl className="action-project-sync-conflict-versions">
            <div>
              <dt>工作区</dt>
              <dd>{versionLabel("local", status)}</dd>
            </div>
            <div>
              <dt>Quicker</dt>
              <dd>
                {versionLabel("remote", status)}
                {remoteTitle ? ` · ${remoteTitle}` : ""}
              </dd>
            </div>
          </dl>
        </div>
        <footer className="action-project-sync-conflict-footer">
          <button
            ref={cancelRef}
            type="button"
            className="project-info-toolbar-btn"
            disabled={busy}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className="project-info-toolbar-btn"
            disabled={busy}
            onClick={onUseQuicker}
          >
            {busy ? "同步中…" : "使用 Quicker 版本"}
          </button>
          <button
            type="button"
            className="project-info-toolbar-btn project-info-toolbar-btn--primary"
            disabled={busy}
            onClick={onUseWorkspace}
          >
            {busy ? "同步中…" : "使用工作区版本"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
