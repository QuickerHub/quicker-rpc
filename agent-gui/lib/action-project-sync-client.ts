import type { ActionProjectSyncStatus } from "@/lib/action-project-sync-types";
import type { WorkspaceProjectSummary } from "@/lib/action-project-display";
import { markActionProjectSyncedAfterPush } from "@/lib/action-project-sync-events";
import { normalizeActionProjectEditVersion, type ActionProjectEditVersion } from "./action-project-edit-version";
import { parseQkrpcJson } from "./qkrpc-json";
import { isInvalidActionProjectEditVersion } from "./action-project-edit-version";
import { formatSyncStatusMessage } from "./action-project-sync-types";

export type ActionSyncOp = "status" | "pull" | "push";

async function postActionSync(
  cwd: string,
  body: {
    op: ActionSyncOp;
    actionId: string;
    projectDirectory?: string;
    force?: boolean;
  },
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; error: string; versionConflict?: boolean }
> {
  try {
    const res = await fetch("/api/workspace/action-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd, ...body }),
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
    };
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: data.error ?? `HTTP ${res.status}`,
        versionConflict: data.versionConflict === true,
      };
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
): Promise<
  | { ok: true; status: ActionProjectSyncStatus }
  | { ok: false; error: string }
> {
  const result = await postActionSync(cwd, { op: "status", actionId });
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
  options?: { projectDirectory?: string },
): Promise<
  | { ok: true; message: string; summary?: WorkspaceProjectSummary; editVersion?: ActionProjectEditVersion }
  | { ok: false; error: string }
> {
  const result = await postActionSync(cwd, {
    op: "pull",
    actionId,
    projectDirectory: options?.projectDirectory,
  });
  if (!result.ok) return result;
  const data = result.data as {
    message?: string;
    summary?: WorkspaceProjectSummary;
  };
  const editVersion = normalizeActionProjectEditVersion(data.summary?.editVersion);
  if (editVersion != null) {
    markActionProjectSyncedAfterPush(cwd, actionId, editVersion);
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
  options?: { force?: boolean },
): Promise<
  | { ok: true; message: string; editVersion?: ActionProjectEditVersion }
  | { ok: false; error: string; versionConflict?: boolean }
> {
  const result = await postActionSync(cwd, {
    op: "push",
    actionId,
    force: options?.force,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      versionConflict: result.versionConflict,
    };
  }
  const data = result.data as {
    message?: string;
    editVersion?: ActionProjectEditVersion;
  };
  const editVersion = normalizeActionProjectEditVersion(data.editVersion);
  if (editVersion != null) {
    markActionProjectSyncedAfterPush(cwd, actionId, editVersion);
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
