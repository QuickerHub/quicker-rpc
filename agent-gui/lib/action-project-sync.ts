import {
  buildWorkspaceProjectSummary,
  type WorkspaceProjectSummary,
} from "@/lib/action-project-display";
import {
  parseQkrpcPayload,
  readActionProjectManifest,
  readStructuredQkrpcFailureMessage,
  saveActionFromWorkspace,
  syncActionToWorkspace,
} from "@/lib/action-project-workflow";
import { runQkrpcForTool } from "@/lib/qkrpc";
import {
  readCompressedFromGetPayload,
  readEditVersionFromGetPayload,
  normalizeEditVersion,
  hasImpreciseEditVersionFromGetPayload,
} from "@/lib/action-project-info-from-get";
import {
  compareActionEditVersions,
  formatSyncStatusMessage,
  type ActionProjectSyncState,
  type ActionProjectSyncStatus,
} from "@/lib/action-project-sync-types";
import {
  readActionProjectSyncTrust,
  writeActionProjectSyncTrust,
} from "@/lib/action-project-sync-trust";
import type { ActionProjectEditVersion } from "./action-project-edit-version";
import { actionProjectBindingFailure, requireActionProjectBinding, withBoundActionProject } from "./action-project-host-binding.server";
import { getRequestAbortSignal } from "./qkrpc-request-context";

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
  | { ok: true; editVersion?: ActionProjectEditVersion; title?: string; impreciseEditVersion?: boolean }
  | { ok: false; error: string; code?: string; retryable?: false }
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
    const failure = parseQkrpcPayload(getResult);
    const candidate = failure?.errorCode ?? failure?.error;
    return {
      ok: false,
      error: getResult.stderr || "action get failed",
      code: typeof candidate === "string" && /^[A-Z][A-Z0-9_]+$/.test(candidate) ? candidate : undefined,
      retryable: false,
    };
  }
  const payload = parseQkrpcPayload(getResult);
  return {
    ok: true,
    editVersion: readEditVersionFromGetPayload(payload),
    impreciseEditVersion: hasImpreciseEditVersionFromGetPayload(payload),
    title: readRemoteTitle(payload),
  };
}

export async function getActionProjectSyncStatus(
  actionId: string,
): Promise<
  | { ok: true; status: ActionProjectSyncStatus }
  | { ok: false; error: string; code?: string; retryable?: false }
> {
  try { return await withBoundActionProject(actionId, (directory) => getActionProjectSyncStatusUnderOwner(actionId, directory)); }
  catch (error) {
    getRequestAbortSignal()?.throwIfAborted();
    return { ok: false, ...actionProjectBindingFailure(error) };
  }
}

async function getActionProjectSyncStatusUnderOwner(actionId: string, directory: string): Promise<
  | { ok: true; status: ActionProjectSyncStatus } | { ok: false; error: string }
> {
  const remote = await fetchRemoteActionEditVersion(actionId);
  if (!remote.ok) {
    return remote;
  }

  const manifest = await readActionProjectManifest(actionId, directory);
  if ("error" in manifest) {
    const state = remote.impreciseEditVersion ? "unknown_remote" : compareActionEditVersions(undefined, remote.editVersion);
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

  const trust = await readActionProjectSyncTrust(manifest.projectDirectory);
  const localVersion = normalizeEditVersion(manifest.editVersion);
  const state = remote.impreciseEditVersion ? "unknown_remote"
    : compareActionEditVersions(
    localVersion,
    remote.editVersion,
    { trustedRemoteEditVersion: trust?.editVersion },
  );
  const remoteForMessage =
    state === "in_sync" && remote.editVersion == null && localVersion != null
      ? localVersion
      : remote.editVersion;
  let message = formatSyncStatusMessage(
    state,
    localVersion,
    remoteForMessage,
  );

  return {
    ok: true,
    status: {
      state,
      message,
      localEditVersion: localVersion,
      remoteEditVersion: remoteForMessage,
      remoteTitle: remote.title,
      projectDirectory: manifest.projectDirectory,
    },
  };
}

export type ActionProjectPullResult =
  | { ok: true; summary: WorkspaceProjectSummary; message: string }
  | { ok: false; error: string; code?: string; retryable?: false };

export async function pullActionProjectToWorkspace(
  actionId: string,
  options?: { projectDirectory?: string },
): Promise<ActionProjectPullResult> {
  try { await requireActionProjectBinding(actionId); }
  catch (error) {
    getRequestAbortSignal()?.throwIfAborted();
    return { ok: false, ...actionProjectBindingFailure(error) };
  }
  const sync = await syncActionToWorkspace(actionId, options);
  if (!sync.ok) {
    return { ok: false, error: sync.error, code: sync.code, retryable: sync.retryable };
  }
  const summary = buildWorkspaceProjectSummary(sync.manifest);
  const version =
    summary.editVersion != null ? ` v${summary.editVersion}` : "";
  const trustedVersion = normalizeEditVersion(summary.editVersion);
  if (trustedVersion != null && summary.projectDirectory) {
    await writeActionProjectSyncTrust(summary.projectDirectory, trustedVersion);
  }
  return {
    ok: true,
    summary,
    message: `已从 Quicker 拉取到 ${summary.projectDirectory}${version}`,
  };
}

export type ActionProjectPushResult =
  | { ok: true; message: string; editVersion?: ActionProjectEditVersion }
  | { ok: false; error: string; code?: string; retryable?: false; phase?: string; versionConflict?: boolean };

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
    const message = readStructuredQkrpcFailureMessage(result);
    const phase =
      typeof payload?.phase === "string" ? payload.phase : undefined;
    const versionConflict =
      payload?.versionConflict === true
      || /version conflict/i.test(message);
    return { ok: false, error: message, phase, versionConflict,
      code: typeof payload?.errorCode === "string" ? payload.errorCode : undefined, retryable: false };
  }

  const data =
    typeof result.data === "object" && result.data !== null
      ? (result.data as Record<string, unknown>)
      : null;
  const payload =
    data && typeof data.payload === "object" && data.payload !== null
      ? (data.payload as Record<string, unknown>)
      : data;

  const editVersion = normalizeEditVersion(readEditVersionFromGetPayload(payload));
  const version =
    editVersion != null ? `（Quicker v${editVersion}）` : "";
  return {
    ok: true,
    message: `已提交到 Quicker${version}`,
    editVersion,
  };
}
