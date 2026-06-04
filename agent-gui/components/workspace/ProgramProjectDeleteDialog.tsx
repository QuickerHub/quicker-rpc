"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ProgramProjectDeleteKind } from "@/lib/use-program-project-delete";

export type ProgramProjectDeleteDialogProps = {
  open: boolean;
  displayTitle: string;
  kind: ProgramProjectDeleteKind;
  /** When false, Quicker checkbox is hidden (embedded subprogram or missing id). */
  canDeleteInQuicker: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (alsoDeleteInQuicker: boolean) => void;
};

function quickerLabel(kind: ProgramProjectDeleteKind): string {
  if (kind === "global_subprogram") return "同时从 Quicker 删除公共子程序";
  return "同时从 Quicker 删除动作";
}

export function ProgramProjectDeleteDialog({
  open,
  displayTitle,
  kind,
  canDeleteInQuicker,
  busy = false,
  onCancel,
  onConfirm,
}: ProgramProjectDeleteDialogProps) {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [alsoInQuicker, setAlsoInQuicker] = useState(true);

  useEffect(() => {
    if (open) {
      setAlsoInQuicker(true);
    }
  }, [open]);

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

  if (!open || typeof document === "undefined") {
    return null;
  }

  const name = displayTitle.trim() || "此项目";

  return createPortal(
    <div
      className="program-project-delete-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onCancel();
        }
      }}
    >
      <div
        className="program-project-delete-dialog composer-popup"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="program-project-delete-header">
          <h2 id={titleId}>删除「{name}」？</h2>
        </header>
        <div className="program-project-delete-body">
          <p id={descId} className="program-project-delete-desc">
            {canDeleteInQuicker && alsoInQuicker
              ? "将同时从工作区与 Quicker 中移除，此操作不可撤销。"
              : "将从工作区移除本地项目目录，Quicker 内的项目保留。"}
          </p>
          {canDeleteInQuicker ? (
            <label className="program-project-delete-checkbox">
              <input
                type="checkbox"
                checked={alsoInQuicker}
                disabled={busy}
                onChange={(event) => setAlsoInQuicker(event.target.checked)}
              />
              <span>{quickerLabel(kind)}</span>
            </label>
          ) : null}
        </div>
        <footer className="program-project-delete-footer">
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
            className="project-info-toolbar-btn project-info-toolbar-btn--danger"
            disabled={busy}
            onClick={() => onConfirm(canDeleteInQuicker && alsoInQuicker)}
          >
            {busy ? "删除中…" : "删除"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
