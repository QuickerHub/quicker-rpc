import type { QkrpcInvoke } from "@/lib/qkrpc-argv";
import { getRequestCwd } from "@/lib/qkrpc-request-context";
import { resolveEffectiveWorkingDirectory } from "@/lib/default-working-directory";
import type { QkrpcRunResult } from "@/lib/qkrpc-types";

const WORKSPACE_PROJECT_OPS = new Set([
  "action.extract",
  "action.apply",
  "action.validate",
  "project.lint.schedule",
  "project.diagnostics.get",
]);

function attachWorkspaceRoot(invoke: QkrpcInvoke): QkrpcInvoke {
  if (!WORKSPACE_PROJECT_OPS.has(invoke.op)) {
    return invoke;
  }
  const cwd = resolveEffectiveWorkingDirectory(getRequestCwd());
  if (typeof invoke.args.workspaceRoot === "string" && invoke.args.workspaceRoot.trim()) {
    return invoke;
  }
  return { ...invoke, args: { ...invoke.args, workspaceRoot: cwd } };
}

const DEFAULT_HTTP_BASE = "http://127.0.0.1:9477";

export function resolveQkrpcHttpBase(): string {
  const raw = process.env.QKRPC_HTTP_URL?.trim()
    ?? process.env.QKRPC_HTTP?.trim();
  if (raw) return raw.replace(/\/$/, "");
  return DEFAULT_HTTP_BASE;
}

export function isHttpConfigured(): boolean {
  return (
    process.env.QKRPC_HTTP_URL?.trim() !== undefined
    || process.env.QKRPC_HTTP?.trim() !== undefined
  );
}

/** @deprecated Use shouldUseHttpTransport() from qkrpc-transport.ts */
export function isHttpPreferred(): boolean {
  const mode = process.env.QKRPC_TRANSPORT?.trim().toLowerCase();
  if (mode === "cli" || mode === "spawn") return false;
  if (mode === "http" || mode === "serve") return true;
  return isHttpConfigured() || process.env.QKRPC_USE_HTTP === "1";
}

type ServeInvokeBody = {
  ok: boolean;
  data?: unknown;
  error?: string;
  message?: string;
};

function connectionRefused(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: string }).code;
  return code === "ECONNREFUSED" || code === "ENOTFOUND";
}

function isServeUnreachableError(err: unknown): boolean {
  if (connectionRefused(err)) {
    return true;
  }
  const message = err instanceof Error ? err.message : String(err);
  return message.toLowerCase().includes("fetch failed");
}

async function alignQkrpcHttpBaseIfNeeded(): Promise<string> {
  const configured = resolveQkrpcHttpBase();
  const { isQkrpcServeHealthy, discoverHealthyQkrpcServe } = await import(
    "@/lib/qkrpc-serve-discover.mjs"
  );
  if (await isQkrpcServeHealthy(configured)) {
    return configured;
  }
  const discovered = await discoverHealthyQkrpcServe();
  return discovered?.baseUrl ?? configured;
}

export async function invokeQkrpcHttp(
  invoke: QkrpcInvoke,
  options?: { timeoutMs?: number },
): Promise<QkrpcRunResult | null> {
  const base = await alignQkrpcHttpBaseIfNeeded();
  const timeoutMs = options?.timeoutMs ?? 120_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs + 5_000);
  const invokeWithWorkspace = attachWorkspaceRoot(invoke);

  try {
    const res = await fetch(`${base}/v1/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: invokeWithWorkspace.op,
        args: invokeWithWorkspace.args,
        timeoutSeconds: Math.max(1, Math.ceil(timeoutMs / 1000)),
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await res.text();
    if (!text.trim()) {
      return null;
    }
    let body: ServeInvokeBody;
    try {
      body = JSON.parse(text) as ServeInvokeBody;
    } catch {
      return {
        ok: false,
        exitCode: 1,
        stdout: "",
        stderr: "qkrpc serve returned invalid JSON",
        parsed: null,
        truncated: false,
      };
    }
    if (!body.ok) {
      return {
        ok: false,
        exitCode: 1,
        stdout: "",
        stderr: body.message ?? body.error ?? `HTTP ${res.status}`,
        parsed: body,
        truncated: false,
      };
    }

    return {
      ok: true,
      exitCode: 0,
      stdout: JSON.stringify(body.data ?? {}),
      stderr: "",
      parsed: body.data ?? null,
      truncated: false,
    };
  } catch (e) {
    if (isServeUnreachableError(e)) {
      return null;
    }
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: message,
      parsed: null,
      truncated: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

type ServeHealthBody = {
  ok?: boolean;
  pong?: string;
  protocolVersion?: number;
  pipe?: string;
};

/** GET /health when qkrpc serve is running; null if serve is not up. */
export async function fetchQkrpcHealth(options?: {
  timeoutMs?: number;
}): Promise<QkrpcRunResult | null> {
  const base = await alignQkrpcHttpBaseIfNeeded();
  const timeoutMs = options?.timeoutMs ?? 12_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs + 2_000);

  try {
    const res = await fetch(`${base}/health`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    if (!text.trim()) {
      // Port open but not qkrpc serve (or broken handler).
      return null;
    }
    let body: ServeHealthBody;
    try {
      body = JSON.parse(text) as ServeHealthBody;
    } catch {
      return null;
    }
    const stdout = JSON.stringify(body);
    const ok = res.ok && body.ok === true;
    return {
      ok,
      exitCode: ok ? 0 : 1,
      stdout,
      stderr: ok ? "" : "QuickerRpc health check failed",
      parsed: body,
      truncated: false,
    };
  } catch (e) {
    if (isServeUnreachableError(e)) {
      return null;
    }
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: message,
      parsed: null,
      truncated: false,
    };
  } finally {
    clearTimeout(timer);
  }
}
