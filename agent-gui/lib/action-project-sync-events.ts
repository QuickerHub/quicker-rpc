import type { ActionProjectSyncStatus } from "@/lib/action-project-sync-types";
import { formatSyncStatusMessage } from "@/lib/action-project-sync-types";
import {
  invalidateActionProjectSyncCache,
  writeActionProjectSyncCache,
} from "@/lib/action-project-sync-cache";

export const ACTION_PROJECT_PUSHED_EVENT = "quicker:action-project-pushed";

export type ActionProjectPushedDetail = {
  cwd: string;
  actionId: string;
  editVersion?: number;
};

export function buildInSyncStatusAfterPush(
  editVersion: number,
): ActionProjectSyncStatus {
  return {
    state: "in_sync",
    message: formatSyncStatusMessage("in_sync", editVersion, editVersion),
    localEditVersion: editVersion,
    remoteEditVersion: editVersion,
  };
}

export function markActionProjectSyncedAfterPush(
  cwd: string,
  actionId: string,
  editVersion?: number,
): void {
  if (!cwd.trim() || !actionId.trim()) return;
  if (editVersion != null && editVersion > 0) {
    const status = buildInSyncStatusAfterPush(editVersion);
    writeActionProjectSyncCache(cwd, actionId, {
      state: status.state,
      message: status.message,
      error: false,
    });
  } else {
    invalidateActionProjectSyncCache(cwd, actionId);
  }

  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ActionProjectPushedDetail>(ACTION_PROJECT_PUSHED_EVENT, {
      detail: { cwd, actionId, editVersion },
    }),
  );
}
