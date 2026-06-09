import { invokeQkrpcHttp } from "@/lib/qkrpc-http";
import type { QkrpcRunResult } from "@/lib/qkrpc-types";

export { buildSharedActionPageUrl } from "@/lib/action-shared-info-preview.server";

const SHARED_INFO_TIMEOUT_MS = 120_000;

export type ActionSharedInfoGetResult = {
  ok: boolean;
  sharedId?: string;
  html?: string;
  message?: string;
  error?: string;
};

export type ActionSharedInfoSetResult = {
  ok: boolean;
  sharedId?: string;
  message?: string;
  error?: string;
};

function readMessage(result: QkrpcRunResult): string {
  const stderr = result.stderr?.trim();
  if (stderr) return stderr;
  const parsed = result.parsed;
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    const msg = record.message ?? record.error ?? record.errorMessage;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return "qkrpc shared-info 请求失败";
}

function readDataRecord(result: QkrpcRunResult): Record<string, unknown> | null {
  const parsed = result.parsed;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
}

/** Read getquicker Detail HTML via Plugin HTTP (action.shared-info.get). */
export async function invokeActionSharedInfoGet(
  idOrSharedId: string,
): Promise<ActionSharedInfoGetResult> {
  const id = idOrSharedId.trim();
  if (!id) {
    return { ok: false, error: "id is required." };
  }

  const result = await invokeQkrpcHttp(
    { op: "action.shared-info.get", args: { id } },
    { timeoutMs: SHARED_INFO_TIMEOUT_MS },
  );
  if (!result?.ok) {
    return { ok: false, error: readMessage(result ?? { ok: false, stderr: "serve unreachable" } as QkrpcRunResult) };
  }

  const data = readDataRecord(result);
  const ok = data?.ok === true;
  const sharedId = typeof data?.sharedId === "string" ? data.sharedId : id;
  const html = typeof data?.html === "string" ? data.html : undefined;
  const message = typeof data?.message === "string" ? data.message : undefined;

  if (!ok) {
    return { ok: false, sharedId, error: message ?? readMessage(result) };
  }

  return { ok: true, sharedId, html, message };
}

/** Update getquicker Detail HTML via Plugin HTTP multipart (action.shared-info.set). */
export async function invokeActionSharedInfoSet(
  idOrSharedId: string,
  html: string,
): Promise<ActionSharedInfoSetResult> {
  const id = idOrSharedId.trim();
  if (!id) {
    return { ok: false, error: "id is required." };
  }
  if (!html.trim()) {
    return { ok: false, error: "html is required." };
  }

  const result = await invokeQkrpcHttp(
    { op: "action.shared-info.set", args: { id, html } },
    { timeoutMs: SHARED_INFO_TIMEOUT_MS },
  );
  if (!result?.ok) {
    return { ok: false, error: readMessage(result ?? { ok: false, stderr: "serve unreachable" } as QkrpcRunResult) };
  }

  const data = readDataRecord(result);
  const ok = data?.ok === true;
  const sharedId = typeof data?.sharedId === "string" ? data.sharedId : id;
  const message = typeof data?.message === "string" ? data.message : undefined;

  if (!ok) {
    return { ok: false, sharedId, error: message ?? readMessage(result) };
  }

  return { ok: true, sharedId, message };
}
