"use client";

import { useCallback, useState } from "react";
import { ProgramProjectDeleteDialog } from "@/components/workspace/ProgramProjectDeleteDialog";
import {
  useProgramProjectDelete,
  type ProgramProjectDeleteKind,
} from "@/lib/use-program-project-delete";
import { workspaceExplorerActionsRef } from "@/lib/workspace-explorer";

export type ProgramProjectDeleteControlProps = {
  kind: ProgramProjectDeleteKind;
  quickerId?: string;
  projectPath: string;
  cwd: string;
  displayTitle: string;
  className?: string;
  onDeleted?: () => void;
};

function IconTrash() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M2.5 3.5h7M4.5 3.5V2.5h3v1M5 5.5v3M7 5.5v3M3.5 3.5l.5 6h4l.5-6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ProgramProjectDeleteControl({
  kind,
  quickerId,
  projectPath,
  cwd,
  displayTitle,
  className,
  onDeleted,
}: ProgramProjectDeleteControlProps) {
  const [open, setOpen] = useState(false);

  const handleDeleted = useCallback(() => {
    onDeleted?.();
    workspaceExplorerActionsRef.current.notifyProjectRemoved();
  }, [onDeleted]);

  const { busy, disabled, statusText, statusErr, executeDelete } =
    useProgramProjectDelete({
      kind,
      quickerId,
      projectPath,
      cwd,
      displayTitle,
      onDeleted: handleDeleted,
    });

  const canDeleteInQuicker =
    kind !== "embedded_subprogram" && Boolean(quickerId?.trim());

  const handleConfirm = useCallback(
    async (alsoDeleteInQuicker: boolean) => {
      const ok = await executeDelete(alsoDeleteInQuicker);
      if (ok) {
        setOpen(false);
      }
    },
    [executeDelete],
  );

  return (
    <>
      <div
        className={["program-project-delete-control", className]
          .filter(Boolean)
          .join(" ")}
      >
        <button
          type="button"
          className="project-info-toolbar-btn project-info-toolbar-btn--danger program-project-delete-btn"
          disabled={disabled}
          title="删除"
          aria-label={`删除 ${displayTitle}`}
          onClick={() => setOpen(true)}
        >
          <IconTrash />
          <span>删除</span>
        </button>
        {statusText ? (
          <span
            className={`project-info-toolbar-status${
              statusErr ? " project-info-toolbar-status--err" : ""
            }`}
          >
            {statusText}
          </span>
        ) : null}
      </div>
      <ProgramProjectDeleteDialog
        open={open}
        displayTitle={displayTitle}
        kind={kind}
        canDeleteInQuicker={canDeleteInQuicker}
        busy={busy}
        onCancel={() => {
          if (!busy) setOpen(false);
        }}
        onConfirm={(alsoDeleteInQuicker) => void handleConfirm(alsoDeleteInQuicker)}
      />
    </>
  );
}
