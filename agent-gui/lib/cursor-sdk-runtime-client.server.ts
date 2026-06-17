import "server-only";

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchCursorSdkRuntimeHealth,
  resolveCursorSdkPort,
} from "@/lib/cursor-sdk-runtime-lifecycle.mjs";

const agentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export function resolveCursorSdkRuntimeHost(): string {
  return process.env.QUICKER_CURSOR_SDK_HOST?.trim() || "127.0.0.1";
}

export function resolveCursorSdkRuntimeBase(): string {
  const host = resolveCursorSdkRuntimeHost();
  const port = resolveCursorSdkPort();
  return `http://${host}:${port}`;
}

export type CursorSdkRuntimeEnsureResult = {
  ok: boolean;
  base?: string;
  port?: number;
  message?: string;
};

export async function ensureCursorSdkRuntimeServer(): Promise<CursorSdkRuntimeEnsureResult> {
  const { isCursorSdkDevEnabled } = await import(
    "@/lib/cursor-sdk/dev-guard.server"
  );
  if (!isCursorSdkDevEnabled()) {
    return { ok: false, message: "cursor-sdk-runtime is dev-only" };
  }

  const host = resolveCursorSdkRuntimeHost();
  const port = resolveCursorSdkPort();
  const base = `http://${host}:${port}`;

  const existing = await fetchCursorSdkRuntimeHealth(base, 1500);
  if (existing.ok) {
    return { ok: true, base, port };
  }

  const { ensureCursorSdkRuntime } = await import(
    "@/lib/cursor-sdk-runtime-lifecycle.mjs"
  );
  await ensureCursorSdkRuntime(agentGuiRoot, host);

  const health = await fetchCursorSdkRuntimeHealth(base, 5000);
  if (!health.ok) {
    return {
      ok: false,
      message: `cursor-sdk-runtime is not healthy at ${base}/health`,
    };
  }

  return { ok: true, base, port };
}

export async function fetchCursorSdkRuntimeJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const { isCursorSdkDevEnabled } = await import(
    "@/lib/cursor-sdk/dev-guard.server"
  );
  if (!isCursorSdkDevEnabled()) {
    throw new Error("cursor-sdk-runtime is dev-only");
  }

  const ensured = await ensureCursorSdkRuntimeServer();
  if (!ensured.ok || !ensured.base) {
    throw new Error(ensured.message ?? "cursor-sdk-runtime unavailable");
  }

  const res = await fetch(`${ensured.base}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : `cursor-sdk-runtime ${path} failed (${res.status})`,
    );
  }
  return body;
}

export async function postCursorSdkRuntimeChat(body: {
  sessionId: string;
  prompt: string;
  cwd: string;
  model: string;
  newSession?: boolean;
}): Promise<Response> {
  const { isCursorSdkDevEnabled } = await import(
    "@/lib/cursor-sdk/dev-guard.server"
  );
  if (!isCursorSdkDevEnabled()) {
    throw new Error("cursor-sdk-runtime is dev-only");
  }

  const ensured = await ensureCursorSdkRuntimeServer();
  if (!ensured.ok || !ensured.base) {
    throw new Error(ensured.message ?? "cursor-sdk-runtime unavailable");
  }

  return fetch(`${ensured.base}/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}
