"use client";

import { useCallback, useState } from "react";
import { ProgramProjectDeleteDialog } from "@/components/workspace/ProgramProjectDeleteDialog";
import { deleteActionInQuicker } from "@/lib/action-quicker-delete";
import { pushAppMessage } from "@/lib/app-messages";
import { resolveActionWorkspaceProject } from "@/lib/resolve-action-workspace-project";
import { useProgramProjectDelete } from "@/lib/use-program-project-delete";
import { workspaceExplorerActionsRef } from "@/lib/workspace-explorer";

const TOAST_ID = "action-link-delete";

type ActionLinkCardDeleteProps = {
  actionId: string;
  cwd: string;
  displayTitle: string;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  /** Called when the action was removed from Quicker (card can be hidden). */
  onDismissed?: () => void;
};

export function ActionLinkCardDelete({
  actionId,
  cwd,
  displayTitle,
  disabled = false,
  onBusyChange,
  onDismissed,
}: ActionLinkCardDeleteProps) {
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState<"workspace" | "quicker-only">(
    "workspace",
  );
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const handleDeleted = useCallback(
    (message: string) => {
      workspaceExplorerActionsRef.current.notifyProjectRemoved();
      pushAppMessage({
        id: TOAST_ID,
        kind: "success",
        body: message,
        autoDismissMs: 3500,
      });
    },
    [],
  );

  const { busy, executeDelete } = useProgramProjectDelete({
    kind: "action",
    quickerId: actionId,
    projectPath: projectPath ?? "",
    cwd,
    displayTitle,
    onDeleted: () => handleDeleted("已删除"),
  });

  const setBusy = useCallback(
    (value: boolean) => {
      onBusyChange?.(value);
    },
    [onBusyChange],
  );

  const openDialog = useCallback(async () => {
    if (disabled || opening || busy) return;
    setOpening(true);
    setBusy(true);
    try {
      const resolved = cwd
        ? await resolveActionWorkspaceProject(cwd, actionId)
        : null;
      if (resolved?.projectPath) {
        setProjectPath(resolved.projectPath);
        setVariant("workspace");
      } else {
        setProjectPath(null);
        setVariant("quicker-only");
      }
      setOpen(true);
    } finally {
      setOpening(false);
      setBusy(false);
    }
  }, [actionId, busy, cwd, disabled, opening, setBusy]);

  const handleConfirm = useCallback(
    async (alsoDeleteInQuicker: boolean) => {
      if (variant === "quicker-only") {
        setBusy(true);
        const result = await deleteActionInQuicker(actionId);
        setBusy(false);
        if (result.ok) {
          handleDeleted("已从 Quicker 删除动作");
          setOpen(false);
          onDismissed?.();
          return;
        }
        pushAppMessage({
          id: TOAST_ID,
          kind: "error",
          body: result.error,
          autoDismissMs: 6000,
        });
        return;
      }

      if (!projectPath) return;
      const ok = await executeDelete(alsoDeleteInQuicker);
      if (ok) {
        setOpen(false);
        if (alsoDeleteInQuicker) {
          onDismissed?.();
        }
      }
    },
    [
      actionId,
      executeDelete,
      handleDeleted,
      onDismissed,
      projectPath,
      setBusy,
      variant,
    ],
  );

  const dialogBusy = busy || opening;

  return (
    <>
      <button
        type="button"
        className="action-link-card-btn action-link-card-btn--delete"
        disabled={disabled || dialogBusy}
        title={`删除 · ${actionId}`}
        onClick={() => void openDialog()}
      >
        {opening ? "…" : "删除"}
      </button>
      <ProgramProjectDeleteDialog
        open={open}
        displayTitle={displayTitle}
        kind="action"
        variant={variant}
        canDeleteInQuicker={variant === "workspace"}
        busy={dialogBusy}
        onCancel={() => {
          if (!dialogBusy) setOpen(false);
        }}
        onConfirm={(alsoDeleteInQuicker) => void handleConfirm(alsoDeleteInQuicker)}
      />
    </>
  );
}
