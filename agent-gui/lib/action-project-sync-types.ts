import { normalizeActionProjectEditVersion, isInvalidActionProjectEditVersion, comparePreciseActionProjectEditVersions, type ActionProjectEditVersion } from "./action-project-edit-version";

export type ActionProjectSyncState =
  | "in_sync"
  | "quicker_ahead"
  | "disk_ahead"
  | "unknown_local"
  | "unknown_remote";

export type ActionProjectSyncStatus = {
  state: ActionProjectSyncState;
  message: string;
  localEditVersion?: ActionProjectEditVersion;
  remoteEditVersion?: ActionProjectEditVersion;
  remoteTitle?: string;
  projectDirectory?: string;
};

export function compareActionEditVersions(
  local?: ActionProjectEditVersion,
  remote?: ActionProjectEditVersion,
  options?: { trustedRemoteEditVersion?: ActionProjectEditVersion },
): ActionProjectSyncState {
  const normLocal = normalizeActionProjectEditVersion(local);
  const normRemote = normalizeActionProjectEditVersion(remote);
  const normTrusted = normalizeActionProjectEditVersion(options?.trustedRemoteEditVersion);
  if (isInvalidActionProjectEditVersion(remote)) return "unknown_remote";
  if (isInvalidActionProjectEditVersion(local)) return "unknown_local";

  // Trust records the catalog version we last pulled/pushed successfully.
  if (normTrusted != null && normRemote != null && normTrusted === normRemote) {
    return "in_sync";
  }

  if (normRemote == null) {
    if (
      normLocal != null
      && normTrusted != null
      && normLocal === normTrusted
    ) {
      return "in_sync";
    }
    return normLocal == null ? "unknown_local" : "unknown_remote";
  }
  if (normLocal == null) return "unknown_local";
  if (normLocal === normRemote) return "in_sync";
  if (comparePreciseActionProjectEditVersions(normLocal, normRemote) < 0) return "quicker_ahead";
  return "disk_ahead";
}

/** Recommended one-click sync operation from a resolved sync state. */
export type ActionProjectSyncAction = "none" | "pull" | "push";

export function resolveActionProjectSyncAction(
  state: ActionProjectSyncState,
): ActionProjectSyncAction {
  switch (state) {
    case "quicker_ahead":
    case "unknown_local":
      return "pull";
    case "disk_ahead":
      return "push";
    default:
      return "none";
  }
}

/** Smart sync decision after status check (may prompt user on conflict). */
export type ActionProjectSyncDecision =
  | { kind: "none" }
  | { kind: "pull" }
  | { kind: "push" }
  | { kind: "conflict"; status: ActionProjectSyncStatus };

export function resolveActionProjectSyncDecision(
  status: ActionProjectSyncStatus,
  options?: { hasLocalChanges?: boolean },
): ActionProjectSyncDecision {
  const localChanges = options?.hasLocalChanges ?? false;
  const { state } = status;

  if (state === "unknown_remote") {
    return { kind: "none" };
  }

  if (state === "unknown_local") {
    if (localChanges) {
      return { kind: "push" };
    }
    return { kind: "pull" };
  }

  if (state === "quicker_ahead") {
    if (localChanges) {
      return { kind: "conflict", status };
    }
    return { kind: "pull" };
  }

  if (state === "disk_ahead") {
    return { kind: "push" };
  }

  if (localChanges) {
    return { kind: "push" };
  }

  return { kind: "none" };
}

export function isActionProjectVersionConflictError(error: string): boolean {
  return /version conflict/i.test(error);
}

function formatEditVersionForDisplay(version?: ActionProjectEditVersion): string {
  if (version == null) return "无版本";
  if (typeof version === "number" && version >= 1_000_000_000_000) {
    const date = new Date(version);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    }
  }
  return `v${version}`;
}

export function formatSyncStatusMessage(
  state: ActionProjectSyncState,
  local?: ActionProjectEditVersion,
  remote?: ActionProjectEditVersion,
): string {
  const localLabel =
    local != null ? `本地 ${formatEditVersionForDisplay(local)}` : "本地无版本";
  const remoteLabel =
    remote != null
      ? `Quicker ${formatEditVersionForDisplay(remote)}`
      : "Quicker 无版本";
  switch (state) {
    case "in_sync":
      return remote != null
        ? `已同步（${remoteLabel}）`
        : "已同步";
    case "quicker_ahead":
      return `Quicker 较新，建议拉取（${localLabel} · ${remoteLabel}）`;
    case "disk_ahead":
      return `工作区较新，建议提交（${localLabel} · ${remoteLabel}）`;
    case "unknown_local":
      return `工作区无项目或未记录版本（${remoteLabel}）`;
    case "unknown_remote":
      return `无法读取 Quicker 版本（${localLabel}）`;
    default:
      return "同步状态未知";
  }
}
