"use client";

import { useCallback, useState } from "react";
import {
  invokeActionCommand,
  isQuickerActionMissingError,
} from "@/lib/action-command-client";
import { nativeConfirm } from "@/lib/native-confirm";
import { deleteActionProjectApi } from "@/lib/workspace-explorer-api";

export type UseActionProjectDeleteOptions = {
  actionId: string;
  projectPath: string;
  cwd: string;
  displayTitle?: string;
  onWorkspaceDeleted?: () => void;
  onQuickerDeleted?: () => void;
};

export function useActionProjectDelete({
  actionId,
  projectPath,
  cwd,
  displayTitle,
  onWorkspaceDeleted,
  onQuickerDeleted,
}: UseActionProjectDeleteOptions) {
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [statusErr, setStatusErr] = useState(false);

  const runCommand = useCallback(
    async (
      label: string,
      fn: () => Promise<{ ok: boolean; error?: string; message?: string }>,
    ) => {
      if (busy) return false;
      setBusy(true);
      setStatusText(null);
      setStatusErr(false);
      const result = await fn();
      setBusy(false);
      if (result.ok) {
        setStatusText(result.message ?? label);
        setStatusErr(false);
        return true;
      }
      setStatusText(result.error ?? "操作失败");
      setStatusErr(true);
      return false;
    },
    [busy],
  );

  const deleteInWorkspaceOnly = useCallback(async (options?: { confirm?: boolean }) => {
    if (options?.confirm !== false) {
      const name = displayTitle?.trim() || projectPath.split("/").pop() || projectPath;
      const ok = await nativeConfirm(
        `在工作区删除动作项目「${name}」？\n\n仅删除本地 .quicker/actions 目录，不会删除 Quicker 内的动作。`,
      );
      if (!ok) return false;
    }
    return runCommand("已在工作区删除", async () => {
      const result = await deleteActionProjectApi(cwd, projectPath);
      if (result.ok) onWorkspaceDeleted?.();
      return result;
    });
  }, [
    cwd,
    displayTitle,
    onWorkspaceDeleted,
    projectPath,
    runCommand,
  ]);

  const deleteDirect = useCallback(async (options?: { confirm?: boolean }) => {
    if (options?.confirm !== false) {
      const name = displayTitle?.trim() || actionId;
      const ok = await nativeConfirm(
        `直接删除动作「${name}」？\n\n将同时从工作区与 Quicker 中移除，此操作不可撤销。`,
      );
      if (!ok) return false;
    }
    return runCommand("已直接删除", async () => {
      const quickerResult = await invokeActionCommand({
        op: "delete",
        id: actionId,
      });
      let skippedQuickerDelete = false;
      if (!quickerResult.ok) {
        if (!isQuickerActionMissingError(quickerResult.error)) {
          return quickerResult;
        }
        skippedQuickerDelete = true;
      }

      const workspaceResult = await deleteActionProjectApi(cwd, projectPath);
      if (!workspaceResult.ok) {
        return {
          ok: false,
          error:
            workspaceResult.error
            ?? (skippedQuickerDelete
              ? "工作区目录删除失败"
              : "Quicker 已删除，但工作区目录删除失败"),
        };
      }

      if (!skippedQuickerDelete) {
        onQuickerDeleted?.();
      }
      onWorkspaceDeleted?.();
      return {
        ok: true,
        message: skippedQuickerDelete
          ? "已从工作区删除（Quicker 中无此动作，已跳过库内删除）"
          : "已直接删除",
      };
    });
  }, [
    actionId,
    cwd,
    displayTitle,
    onQuickerDeleted,
    onWorkspaceDeleted,
    projectPath,
    runCommand,
  ]);

  return {
    busy,
    disabled: busy,
    statusText,
    statusErr,
    deleteInWorkspaceOnly,
    deleteDirect,
  };
}
