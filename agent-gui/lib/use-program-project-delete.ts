"use client";

import { useCallback, useState } from "react";
import {
  invokeActionCommand,
  isQuickerActionMissingError,
} from "@/lib/action-command-client";
import {
  invokeSubProgramCommand,
  isQuickerSubProgramMissingError,
} from "@/lib/subprogram-command-client";
import { deleteActionProjectApi } from "@/lib/workspace-explorer-api";

export type ProgramProjectDeleteKind =
  | "action"
  | "global_subprogram"
  | "embedded_subprogram";

export type UseProgramProjectDeleteOptions = {
  kind: ProgramProjectDeleteKind;
  /** Quicker id or name; omit when only workspace delete is possible. */
  quickerId?: string;
  projectPath: string;
  cwd: string;
  displayTitle?: string;
  onDeleted?: () => void;
};

export function useProgramProjectDelete({
  kind,
  quickerId,
  projectPath,
  cwd,
  onDeleted,
}: UseProgramProjectDeleteOptions) {
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [statusErr, setStatusErr] = useState(false);

  const executeDelete = useCallback(
    async (alsoDeleteInQuicker: boolean) => {
      if (busy) return false;
      setBusy(true);
      setStatusText(null);
      setStatusErr(false);

      const trimmedQuickerId = quickerId?.trim() ?? "";
      const canDeleteInQuicker =
        alsoDeleteInQuicker
        && trimmedQuickerId
        && kind !== "embedded_subprogram";

      let skippedQuickerDelete = false;

      if (canDeleteInQuicker) {
        const quickerResult =
          kind === "global_subprogram"
            ? await invokeSubProgramCommand({ op: "delete", id: trimmedQuickerId })
            : await invokeActionCommand({ op: "delete", id: trimmedQuickerId });

        if (!quickerResult.ok) {
          const missing =
            kind === "global_subprogram"
              ? isQuickerSubProgramMissingError(quickerResult.error)
              : isQuickerActionMissingError(quickerResult.error);
          if (!missing) {
            setBusy(false);
            setStatusText(quickerResult.error);
            setStatusErr(true);
            return false;
          }
          skippedQuickerDelete = true;
        }
      }

      const workspaceResult = await deleteActionProjectApi(cwd, projectPath);
      setBusy(false);

      if (!workspaceResult.ok) {
        setStatusText(
          workspaceResult.error
          ?? (canDeleteInQuicker && !skippedQuickerDelete
            ? "Quicker 已删除，但工作区目录删除失败"
            : "工作区目录删除失败"),
        );
        setStatusErr(true);
        return false;
      }

      onDeleted?.();
      setStatusText(
        skippedQuickerDelete
          ? "已从工作区删除（Quicker 中无此项目，已跳过库内删除）"
          : canDeleteInQuicker
            ? "已删除"
            : "已在工作区删除",
      );
      setStatusErr(false);
      return true;
    },
    [busy, cwd, kind, onDeleted, projectPath, quickerId],
  );

  return {
    busy,
    disabled: busy,
    statusText,
    statusErr,
    executeDelete,
  };
}
