import type { ActionProjectSyncStatus } from "@/lib/action-project-sync-types";
import { formatSyncStatusMessage } from "@/lib/action-project-sync-types";
import { normalizeEditVersion } from "@/lib/action-project-info-from-get";
import type { ActionProjectEditVersion } from "./action-project-edit-version";
import {
  invalidateActionProjectSyncCache,
  writeActionProjectSyncCache,
} from "@/lib/action-project-sync-cache";

export const ACTION_PROJECT_PUSHED_EVENT = "quicker:action-project-pushed";

export type ActionProjectPushedDetail = {
  cwd: string;
  actionId: string;
  editVersion?: ActionProjectEditVersion;
};

export function buildInSyncStatusAfterPush(
  editVersion: ActionProjectEditVersion,
): ActionProjectSyncStatus {
  const normalized = normalizeEditVersion(editVersion);
  if (normalized == null) {
    return { state: "unknown_remote", message: formatSyncStatusMessage("unknown_remote") };
  }
  return {
    state: "in_sync",
    message: formatSyncStatusMessage("in_sync", normalized, normalized),
    localEditVersion: normalized,
    remoteEditVersion: normalized,
  };
}

export function markActionProjectSyncedAfterPush(
  cwd: string,
  actionId: string,
  editVersion?: ActionProjectEditVersion,
): void {
  if (!cwd.trim() || !actionId.trim()) return;
  editVersion = normalizeEditVersion(editVersion);
  if (editVersion != null) {
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
