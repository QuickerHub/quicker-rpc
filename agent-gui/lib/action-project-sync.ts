import {
  buildWorkspaceProjectSummary,
  type WorkspaceProjectSummary,
} from "@/lib/action-project-display";
import {
  parseQkrpcPayload,
  readActionProjectManifest,
  saveActionFromWorkspace,
  syncActionToWorkspace,
} from "@/lib/action-project-workflow";
import { runQkrpcForTool } from "@/lib/qkrpc";
import {
  readCompressedFromGetPayload,
  readEditVersionFromGetPayload,
} from "@/lib/action-project-info-from-get";
import {
  compareActionEditVersions,
  formatSyncStatusMessage,
  type ActionProjectSyncState,
  type ActionProjectSyncStatus,
} from "@/lib/action-project-sync-types";

export type { ActionProjectSyncState, ActionProjectSyncStatus } from "@/lib/action-project-sync-types";
export { compareActionEditVersions, formatSyncStatusMessage } from "@/lib/action-project-sync-types";

function readRemoteTitle(obj: Record<string, unknown> | null): string | undefined {
  if (!obj) return undefined;
  const compressed = readCompressedFromGetPayload(obj);
  const title = compressed?.title ?? compressed?.Title ?? obj.title ?? obj.Title;
  if (typeof title === "string" && title.trim()) return title.trim();
  return undefined;
}

export async function fetchRemoteActionEditVersion(
  actionId: string,
): Promise<
  | { ok: true; editVersion?: number; title?: string }
  | { ok: false; error: string }
> {
  const getResult = await runQkrpcForTool([
    "action",
    "get",
    "--id",
    actionId.trim(),
    "--return-mode",
    "metadata",
  ]);
  if (!getResult.ok) {
    return {
      ok: false,
      error: getResult.stderr || "action get failed",
    };
  }
  const payload = parseQkrpcPayload(getResult);
  return {
    ok: true,
    editVersion: readEditVersionFromGetPayload(payload),
    title: readRemoteTitle(payload),
  };
}

export async function getActionProjectSyncStatus(
  actionId: string,
): Promise<
  | { ok: true; status: ActionProjectSyncStatus }
  | { ok: false; error: string }
> {
  const remote = await fetchRemoteActionEditVersion(actionId);
  if (!remote.ok) {
    return { ok: false, error: remote.error };
  }

  const manifest = await readActionProjectManifest(actionId);
  if ("error" in manifest) {
    const state = compareActionEditVersions(undefined, remote.editVersion);
    return {
      ok: true,
      status: {
        state,
        message: `${formatSyncStatusMessage(state, undefined, remote.editVersion)} · ${manifest.error}`,
        remoteEditVersion: remote.editVersion,
        remoteTitle: remote.title,
      },
    };
  }

  const state = compareActionEditVersions(
    manifest.editVersion,
    remote.editVersion,
  );
  let message = formatSyncStatusMessage(
    state,
    manifest.editVersion,
    remote.editVersion,
  );

  return {
    ok: true,
    status: {
      state,
      message,
      localEditVersion: manifest.editVersion,
      remoteEditVersion: remote.editVersion,
      remoteTitle: remote.title,
      projectDirectory: manifest.projectDirectory,
    },
  };
}

export type ActionProjectPullResult =
  | { ok: true; summary: WorkspaceProjectSummary; message: string }
  | { ok: false; error: string };

export async function pullActionProjectToWorkspace(
  actionId: string,
  options?: { projectDirectory?: string },
): Promise<ActionProjectPullResult> {
  const sync = await syncActionToWorkspace(actionId, options);
  if (!sync.ok) {
    return { ok: false, error: sync.error };
  }
  const summary = buildWorkspaceProjectSummary(sync.manifest);
  const version =
    summary.editVersion != null ? ` v${summary.editVersion}` : "";
  return {
    ok: true,
    summary,
    message: `已从 Quicker 拉取到 ${summary.projectDirectory}${version}`,
  };
}

export type ActionProjectPushResult =
  | { ok: true; message: string; editVersion?: number }
  | { ok: false; error: string; phase?: string };

export async function pushActionProjectToQuicker(options: {
  actionId: string;
  force?: boolean;
}): Promise<ActionProjectPushResult> {
  const result = await saveActionFromWorkspace({
    id: options.actionId,
    force: options.force,
  });
  if (result.ok !== true) {
    const data =
      typeof result.data === "object" && result.data !== null
        ? (result.data as Record<string, unknown>)
        : null;
    const payload =
      data && typeof data.payload === "object" && data.payload !== null
        ? (data.payload as Record<string, unknown>)
        : data;
    const message =
      (typeof payload?.error === "string" && payload.error)
      || (typeof payload?.errorMessage === "string" && payload.errorMessage)
      || (typeof data?.errorMessage === "string" && data.errorMessage)
      || (typeof result.stderr === "string" && result.stderr)
      || "提交到 Quicker 失败";
    const phase =
      typeof payload?.phase === "string" ? payload.phase : undefined;
    return { ok: false, error: message, phase };
  }

  const data =
    typeof result.data === "object" && result.data !== null
      ? (result.data as Record<string, unknown>)
      : null;
  const payload =
    data && typeof data.payload === "object" && data.payload !== null
      ? (data.payload as Record<string, unknown>)
      : data;

  const editVersion = readEditVersionFromGetPayload(payload);
  const version =
    editVersion != null ? `（Quicker v${editVersion}）` : "";
  return {
    ok: true,
    message: `已提交到 Quicker${version}`,
    editVersion,
  };
}
