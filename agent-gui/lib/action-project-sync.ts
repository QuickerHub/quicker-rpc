import {
  buildWorkspaceProjectSummary,
  type WorkspaceProjectSummary,
} from "@/lib/action-project-display";
import {
  parseQkrpcPayload,
  readActionProjectManifest,
  readStructuredQkrpcFailureMessage,
  readStructuredQkrpcErrorCode,
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
import type { ActionProjectSyncTarget } from "./action-project-sync-target";
import type { ActionProjectBinding } from "./action-project-binding";

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
    return {
      ok: false,
      error: getResult.stderr || "action get failed",
      code: readStructuredQkrpcErrorCode(failure),
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
  target?: ActionProjectSyncTarget,
): Promise<
  | { ok: true; status: ActionProjectSyncStatus; projectDirectory: string; projectBinding: ActionProjectBinding }
  | { ok: false; error: string; code?: string; retryable?: false }
> {
  try {
    return await withBoundActionProject(actionId, async (directory, record) => {
      const result = await getActionProjectSyncStatusUnderOwner(actionId, directory);
      return result.ok ? { ...result, projectDirectory: directory, projectBinding: record } : result;
    }, target);
  }
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
  | { ok: true; summary: WorkspaceProjectSummary; message: string; projectDirectory: string; projectBinding: ActionProjectBinding }
  | { ok: false; error: string; code?: string; retryable?: false };

export async function pullActionProjectToWorkspace(
  actionId: string,
  options?: { projectDirectory?: string; target?: ActionProjectSyncTarget },
): Promise<ActionProjectPullResult> {
  let verified: Awaited<ReturnType<typeof requireActionProjectBinding>>;
  try { verified = await requireActionProjectBinding(actionId, options?.target); }
  catch (error) {
    getRequestAbortSignal()?.throwIfAborted();
    return { ok: false, ...actionProjectBindingFailure(error) };
  }
  const target = options?.target ?? { projectDirectory: verified.directory, projectBinding: verified.record };
  const sync = await syncActionToWorkspace(actionId, { ...options, target });
  if (!sync.ok) {
    return { ok: false, error: sync.error, code: sync.code, retryable: sync.retryable };
  }
  const summary = buildWorkspaceProjectSummary(sync.manifest);
  const version =
    summary.editVersion != null ? ` v${summary.editVersion}` : "";
  const trustedVersion = normalizeEditVersion(summary.editVersion);
  try {
    await withBoundActionProject(actionId, async (directory) => {
      if (trustedVersion != null) await writeActionProjectSyncTrust(directory, trustedVersion);
    }, target);
  } catch (error) { getRequestAbortSignal()?.throwIfAborted(); return { ok: false, ...actionProjectBindingFailure(error) }; }
  return {
    ok: true,
    summary,
    message: `已从 Quicker 拉取到 ${summary.projectDirectory}${version}`,
    projectDirectory: verified.directory,
    projectBinding: verified.record,
  };
}

export type ActionProjectPushResult =
  | { ok: true; message: string; editVersion?: ActionProjectEditVersion; projectDirectory: string; projectBinding: ActionProjectBinding }
  | { ok: false; error: string; code?: string; retryable?: false; phase?: string; versionConflict?: boolean; persistedParts?: { body?: boolean; metadata?: boolean } };

export async function pushActionProjectToQuicker(options: {
  actionId: string;
  force?: boolean;
  target?: ActionProjectSyncTarget;
}): Promise<ActionProjectPushResult> {
  const result = await saveActionFromWorkspace({
    id: options.actionId,
    force: options.force,
    target: options.target,
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
      code: typeof payload?.errorCode === "string" ? payload.errorCode : undefined, retryable: false,
      ...(payload?.persistedParts && typeof payload.persistedParts === "object" ? { persistedParts: payload.persistedParts as { body?: boolean; metadata?: boolean } } : {}),
    };
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
    projectDirectory: payload?.projectDirectory as string,
    projectBinding: payload?.projectBinding as ActionProjectBinding,
  };
}
