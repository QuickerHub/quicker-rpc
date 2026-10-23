import type { ActionProjectSyncStatus } from "@/lib/action-project-sync-types";
import type { WorkspaceProjectSummary } from "@/lib/action-project-display";
import { markActionProjectSyncedAfterPush } from "@/lib/action-project-sync-events";
import { normalizeActionProjectEditVersion, type ActionProjectEditVersion } from "./action-project-edit-version";
import { parseQkrpcJson } from "./qkrpc-json";
import { isInvalidActionProjectEditVersion } from "./action-project-edit-version";
import { formatSyncStatusMessage } from "./action-project-sync-types";
import { parseActionProjectBinding } from "./action-project-binding";
import { sameActionProjectSyncTarget, type ActionProjectSyncTarget } from "./action-project-sync-target";

type SyncOptions = { target?: ActionProjectSyncTarget; isCurrent?: () => boolean };
type SyncFailure = { ok: false; error: string; code?: string; retryable?: false; versionConflict?: boolean; persistedParts?: { body?: boolean; metadata?: boolean } };
const staleResponse = (): SyncFailure => ({ ok: false, code: "stale_response", error: "Document target is no longer active." });

export type ActionSyncOp = "status" | "pull" | "push";

async function postActionSync(
  cwd: string,
  body: {
    op: ActionSyncOp;
    actionId: string;
    projectDirectory?: string;
    force?: boolean;
  },
  options?: SyncOptions,
): Promise<
  | { ok: true; data: unknown }
  | SyncFailure
> {
  try {
    const res = await fetch("/api/workspace/action-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd, ...body, ...(options?.target ? { projectDirectory: options.target.projectDirectory, expectedProjectBinding: options.target.projectBinding } : {}) }),
      cache: "no-store",
    });
    const data = parseQkrpcJson(await res.text()) as {
      ok?: boolean;
      error?: string;
      status?: ActionProjectSyncStatus;
      message?: string;
      summary?: WorkspaceProjectSummary;
      editVersion?: ActionProjectEditVersion;
      phase?: string;
      versionConflict?: boolean;
      code?: string;
      retryable?: false;
      projectBinding?: unknown;
      projectDirectory?: string;
      persistedParts?: { body?: boolean; metadata?: boolean };
    };
    if (options?.isCurrent && !options.isCurrent()) return staleResponse();
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: data.error ?? `HTTP ${res.status}`,
        versionConflict: data.versionConflict === true,
        code: data.code,
        retryable: data.retryable,
        persistedParts: data.persistedParts,
      };
    }
    if (options?.target) {
      try {
        const actual = { projectDirectory: data.projectDirectory ?? "", projectBinding: parseActionProjectBinding(data.projectBinding, body.actionId) };
        if (!sameActionProjectSyncTarget(options.target, actual)) throw new Error("Another project target");
      } catch {
        return { ok: false, code: "identity_conflict", error: "Sync response belongs to another project target.", retryable: false };
      }
    }
    return { ok: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("fetch failed") || message.includes("Failed to fetch")) {
      return { ok: false, error: "无法连接工作区 API（请确认 agent-gui 开发服务未在重载中）" };
    }
    return { ok: false, error: message || "action-sync failed" };
  }
}

export async function fetchActionProjectSyncStatus(
  cwd: string,
  actionId: string,
  options?: SyncOptions,
): Promise<
  | { ok: true; status: ActionProjectSyncStatus }
  | SyncFailure
> {
  const result = await postActionSync(cwd, { op: "status", actionId }, options);
  if (options?.isCurrent && !options.isCurrent()) return staleResponse();
  if (!result.ok) return result;
  const data = result.data as { status?: ActionProjectSyncStatus };
  if (!data.status) {
    return { ok: false, error: "Missing sync status in response" };
  }
  const localEditVersion = normalizeActionProjectEditVersion(data.status.localEditVersion);
  const remoteEditVersion = normalizeActionProjectEditVersion(data.status.remoteEditVersion);
  const state = isInvalidActionProjectEditVersion(data.status.remoteEditVersion) ? "unknown_remote"
    : isInvalidActionProjectEditVersion(data.status.localEditVersion) ? "unknown_local" : data.status.state;
  return { ok: true, status: { ...data.status, state, localEditVersion, remoteEditVersion,
    message: state === data.status.state ? data.status.message : formatSyncStatusMessage(state, localEditVersion, remoteEditVersion) } };
}

export async function pullActionProjectFromQuicker(
  cwd: string,
  actionId: string,
  options?: SyncOptions & { projectDirectory?: string },
): Promise<
  | { ok: true; message: string; summary?: WorkspaceProjectSummary; editVersion?: ActionProjectEditVersion }
  | SyncFailure
> {
  const result = await postActionSync(cwd, {
    op: "pull",
    actionId,
    projectDirectory: options?.projectDirectory,
  }, options);
  if (options?.isCurrent && !options.isCurrent()) return staleResponse();
  if (!result.ok) return result;
  const data = result.data as {
    message?: string;
    summary?: WorkspaceProjectSummary;
  };
  const editVersion = normalizeActionProjectEditVersion(data.summary?.editVersion);
  if (editVersion != null) {
    markActionProjectSyncedAfterPush(cwd, actionId, editVersion, options?.target);
  }
  return {
    ok: true,
    message: data.message ?? "已拉取",
    summary: data.summary,
    editVersion,
  };
}

export async function pushActionProjectToQuickerApi(
  cwd: string,
  actionId: string,
  options?: SyncOptions & { force?: boolean },
): Promise<
  | { ok: true; message: string; editVersion?: ActionProjectEditVersion }
  | SyncFailure
> {
  const result = await postActionSync(cwd, {
    op: "push",
    actionId,
    force: options?.force,
  }, options);
  if (options?.isCurrent && !options.isCurrent()) return staleResponse();
  if (!result.ok) {
    return result;
  }
  const data = result.data as {
    message?: string;
    editVersion?: ActionProjectEditVersion;
  };
  const editVersion = normalizeActionProjectEditVersion(data.editVersion);
  if (editVersion != null) {
    markActionProjectSyncedAfterPush(cwd, actionId, editVersion, options?.target);
  }
  return {
    ok: true,
    message: data.message ?? "已提交",
    editVersion,
  };
}

export function notifyActionProjectPushed(
  cwd: string,
  actionId: string,
  editVersion?: ActionProjectEditVersion,
): void {
  markActionProjectSyncedAfterPush(cwd, actionId, editVersion);
}
