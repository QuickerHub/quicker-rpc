import type { ActionProjectSyncStatus } from "@/lib/action-project-sync-types";
import type { WorkspaceProjectSummary } from "@/lib/action-project-display";

export type ActionSyncOp = "status" | "pull" | "push";

async function postActionSync(
  cwd: string,
  body: {
    op: ActionSyncOp;
    actionId: string;
    projectDirectory?: string;
    force?: boolean;
  },
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/workspace/action-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd, ...body }),
      cache: "no-store",
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      status?: ActionProjectSyncStatus;
      message?: string;
      summary?: WorkspaceProjectSummary;
      editVersion?: number;
      phase?: string;
    };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? `HTTP ${res.status}` };
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
  return { ok: true, status: data.status };
}

export async function pullActionProjectFromQuicker(
  cwd: string,
  actionId: string,
  options?: { projectDirectory?: string },
): Promise<
  | { ok: true; message: string; summary?: WorkspaceProjectSummary }
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
  return {
    ok: true,
    message: data.message ?? "已拉取",
    summary: data.summary,
  };
}

export async function pushActionProjectToQuickerApi(
  cwd: string,
  actionId: string,
  options?: { force?: boolean },
): Promise<
  | { ok: true; message: string; editVersion?: number }
  | { ok: false; error: string }
> {
  const result = await postActionSync(cwd, {
    op: "push",
    actionId,
    force: options?.force,
  });
  if (!result.ok) return result;
  const data = result.data as { message?: string; editVersion?: number };
  return {
    ok: true,
    message: data.message ?? "已提交",
    editVersion: data.editVersion,
  };
}
