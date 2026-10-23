import { bindQkrpcTarget, bindingFailure, configuredQkrpcBinding, currentQkrpcTarget, hasUnverifiedQkrpcRead, markUnverifiedQkrpcRead, isOfflineSourceInvoke,
  isQkrpcReadOnlyInvoke, readHostBinding, type QkrpcHostBinding } from "@/lib/qkrpc-host-binding";
import type { QkrpcInvoke } from "@/lib/qkrpc-argv";
import { getRequestCwd } from "@/lib/qkrpc-request-context";
import { resolveRequestAbortSignal } from "@/lib/request-abort-signal";
import { resolveEffectiveWorkingDirectory } from "@/lib/default-working-directory";
import type { QkrpcRunResult } from "@/lib/qkrpc-types";

const WORKSPACE_PROJECT_OPS = new Set([
  "action.open",
  "action.save",
  "action.binding",
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
  if (typeof invoke.args.workspaceRoot === "string" && invoke.args.workspaceRoot.trim()) {
    return invoke;
  }
  const cwd = resolveEffectiveWorkingDirectory(getRequestCwd());
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
  hostBinding?: unknown;
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

async function alignQkrpcHttpBaseIfNeeded(abortSignal?: AbortSignal): Promise<string> {
  abortSignal?.throwIfAborted();
  const configured = resolveQkrpcHttpBase();
  const { isQkrpcServeHealthy, discoverHealthyQkrpcServe } = await import(
    "@/lib/qkrpc-serve-discover.mjs"
  );
  abortSignal?.throwIfAborted();
  if (await isQkrpcServeHealthy(configured, undefined, abortSignal)) {
    abortSignal?.throwIfAborted();
    return configured;
  }
  abortSignal?.throwIfAborted();
  const discovered = await discoverHealthyQkrpcServe(undefined, undefined, undefined, abortSignal);
  abortSignal?.throwIfAborted();
  return discovered?.baseUrl ?? configured;
}

function httpTimeoutResult(timeoutMs: number): QkrpcRunResult {
  return {
    ok: false, exitCode: -1, stdout: "", parsed: null, truncated: false,
    stderr: `qkrpc HTTP request timed out after ${timeoutMs}ms`,
  };
}

export async function resolveQkrpcHttpBinding(base: string, invoke: QkrpcInvoke, signal?: AbortSignal): Promise<QkrpcHostBinding | QkrpcRunResult | undefined> {
  signal?.throwIfAborted();
  const configured = configuredQkrpcBinding();
  if (configured && "exitCode" in configured) return configured;
  if (configured) return bindQkrpcTarget({ gateway: base, binding: configured }).binding;
  if (hasUnverifiedQkrpcRead() && !isQkrpcReadOnlyInvoke(invoke) && !process.env.QKRPC_HOST_SESSION)
    return bindingFailure("HOST_BINDING_REQUIRED", "The previous read had no verified identity. Select a host explicitly before writing.");
  const discovery = await fetch(`${base}/v1/invoke`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "host.list", args: {}, timeoutSeconds: 5 }), signal, cache: "no-store",
  });
  const hosts = await discovery.json() as { data?: { candidates?: unknown[] } };
  signal?.throwIfAborted();
  const session = process.env.QKRPC_HOST_SESSION?.trim();
  const capability = invoke.op === "action.open" ? "action.source.read" : undefined;
  const candidates = (hosts.data?.candidates ?? []).map(readHostBinding).filter((b): b is QkrpcHostBinding =>
    Boolean(b && (!session || b.hostSessionId === session) && (!capability || b.capabilities[capability] === true)));
  if (candidates.length > 1)
    return bindingFailure("HOST_SELECTION_REQUIRED", "Multiple compatible hosts. Select a host session explicitly.");
  let binding = candidates[0];
  if (binding) binding = bindQkrpcTarget({ gateway: base, binding }).binding;
  else if (!isQkrpcReadOnlyInvoke(invoke)) return bindingFailure("HOST_BINDING_REQUIRED", "No verified host binding. Upgrade the plugin or select an available host session.");
  return binding;
}

export async function invokeQkrpcHttp(
  invoke: QkrpcInvoke,
  options?: { timeoutMs?: number; abortSignal?: AbortSignal; hostBinding?: QkrpcHostBinding },
): Promise<QkrpcRunResult | null> {
  const abortSignal = resolveRequestAbortSignal(options?.abortSignal);
  abortSignal?.throwIfAborted();
  const offline = isOfflineSourceInvoke(invoke) || invoke.op.startsWith("guide.");
  const write = !isQkrpcReadOnlyInvoke(invoke);
  const existing = currentQkrpcTarget();
  if (existing?.gateway === "cli" && !offline)
    return bindingFailure("HOST_BINDING_MISMATCH", "This turn is bound to CLI; no HTTP gateway was contacted.");
  const configured = !offline && !options?.hostBinding && !existing ? configuredQkrpcBinding() : undefined;
  if (configured && "exitCode" in configured) return configured;
  const base = (existing?.gateway === "cli" ? undefined : existing?.gateway)
    ?? (write || offline ? resolveQkrpcHttpBase() : await alignQkrpcHttpBaseIfNeeded(abortSignal));
  let binding = offline ? undefined : options?.hostBinding ?? existing?.binding ?? configured;
  const timeoutMs = options?.timeoutMs ?? 120_000;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs + 5_000);
  const signal = abortSignal ? AbortSignal.any([abortSignal, controller.signal]) : controller.signal;
  const invokeWithWorkspace = attachWorkspaceRoot(invoke);
  let dispatched = false;

  try {
    abortSignal?.throwIfAborted();
    if (!offline && !binding && invoke.op === "action.save") {
      const preflight = await fetch(`${base}/v1/invoke`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "action.binding", args: invokeWithWorkspace.args }), signal, cache: "no-store",
      });
      const local = await preflight.json() as ServeInvokeBody;
      abortSignal?.throwIfAborted();
      if (!local.ok) return { ok: false, exitCode: 1, stdout: "", stderr: local.message ?? local.error ?? "Bundle identity unavailable", parsed: local, truncated: false };
      binding = readHostBinding((local.data as { hostBinding?: unknown } | undefined)?.hostBinding);
      if (!binding) return bindingFailure("HOST_BINDING_REQUIRED", "This bundle has no verified host binding. Reopen explicitly.");
      bindQkrpcTarget({ gateway: base, binding });
    }
    if (!offline && !binding && invoke.op !== "action.save") {
      const resolved = await resolveQkrpcHttpBinding(base, invoke, signal);
      if (resolved && "exitCode" in resolved) return resolved;
      binding = resolved;
    }
    if (binding) bindQkrpcTarget({ gateway: base, binding });
    dispatched = true;
    const res = await fetch(`${base}/v1/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: invokeWithWorkspace.op,
        args: invokeWithWorkspace.args,
        ...(binding && !offline ? { hostBinding: binding } : {}),
        timeoutSeconds: Math.max(1, Math.ceil(timeoutMs / 1000)),
      }),
      signal,
      cache: "no-store",
    });

    const text = await res.text();
    abortSignal?.throwIfAborted();
    if (!text.trim()) {
      return write ? bindingFailure("WRITE_RESULT_UNKNOWN", "The write response was empty. Inspect the bound host before retrying.") : null;
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
        parsed: write ? { error: "WRITE_RESULT_UNKNOWN", retryable: false } : null,
        truncated: false,
      };
    }
    if (!binding && !offline) {
      const returned = readHostBinding(body.hostBinding);
      if (returned) bindQkrpcTarget({ gateway: base, binding: returned });
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

    if (!binding && !offline && !currentQkrpcTarget()) markUnverifiedQkrpcRead();
    return {
      ok: true,
      exitCode: 0,
      stdout: JSON.stringify(body.data ?? {}),
      stderr: "",
      parsed: body.data ?? null,
      truncated: false,
    };
  } catch (e) {
    abortSignal?.throwIfAborted();
    if (e instanceof Error && e.message.startsWith("HOST_BINDING_MISMATCH"))
      return bindingFailure("HOST_BINDING_MISMATCH", e.message);
    if (write && !dispatched) return bindingFailure("HOST_UNAVAILABLE", `Host binding could not be verified. ${e instanceof Error ? e.message : String(e)}`);
    if (write) return bindingFailure("WRITE_RESULT_UNKNOWN", timedOut
      ? `qkrpc HTTP request timed out after ${timeoutMs}ms; inspect the bound host before retrying.`
      : `Write result is unknown; inspect the bound host before retrying. ${e instanceof Error ? e.message : String(e)}`);
    if (timedOut) return httpTimeoutResult(timeoutMs);
    if (isServeUnreachableError(e)) {
      return existing || binding ? bindingFailure("HOST_UNAVAILABLE", "The bound gateway/host is unavailable.") : null;
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
  abortSignal?: AbortSignal;
}): Promise<QkrpcRunResult | null> {
  const abortSignal = resolveRequestAbortSignal(options?.abortSignal);
  abortSignal?.throwIfAborted();
  const base = await alignQkrpcHttpBaseIfNeeded(abortSignal);
  const timeoutMs = options?.timeoutMs ?? 12_000;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs + 2_000);
  const signal = abortSignal ? AbortSignal.any([abortSignal, controller.signal]) : controller.signal;

  try {
    abortSignal?.throwIfAborted();
    const res = await fetch(`${base}/health`, {
      method: "GET",
      signal,
      cache: "no-store",
    });
    const text = await res.text();
    abortSignal?.throwIfAborted();
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
    abortSignal?.throwIfAborted();
    if (timedOut) return httpTimeoutResult(timeoutMs);
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
