export type ActionProjectSyncState =
  | "in_sync"
  | "quicker_ahead"
  | "disk_ahead"
  | "unknown_local"
  | "unknown_remote";

export type ActionProjectSyncStatus = {
  state: ActionProjectSyncState;
  message: string;
  localEditVersion?: number;
  remoteEditVersion?: number;
  remoteTitle?: string;
  projectDirectory?: string;
};

export function compareActionEditVersions(
  local?: number,
  remote?: number,
): ActionProjectSyncState {
  if (remote == null) return "unknown_remote";
  if (local == null) return "unknown_local";
  if (local === remote) return "in_sync";
  if (local < remote) return "quicker_ahead";
  return "disk_ahead";
}

export function formatSyncStatusMessage(
  state: ActionProjectSyncState,
  local?: number,
  remote?: number,
): string {
  const localLabel = local != null ? `本地 v${local}` : "本地无版本";
  const remoteLabel = remote != null ? `Quicker v${remote}` : "Quicker 无版本";
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
