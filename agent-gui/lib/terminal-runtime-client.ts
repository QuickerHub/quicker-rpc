import { runtimeHttpOrigin } from "./runtime-http-origin.mjs";

let selectedRuntime: { base: string; runtimeOwner?: string } | undefined;
const DEFAULT_TERMINAL_PORT = 6022;

export function resolveTerminalRuntimePort(): number {
  if (typeof window === "undefined") return DEFAULT_TERMINAL_PORT;
  const fromEnv = process.env.NEXT_PUBLIC_QUICKER_TERMINAL_PORT?.trim();
  if (fromEnv) {
    const parsed = Number(fromEnv);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 65535) {
      return parsed;
    }
  }
  return DEFAULT_TERMINAL_PORT;
}

export function resolveTerminalRuntimeHost(): string {
  if (typeof window === "undefined") return "127.0.0.1";
  return window.location.hostname || "127.0.0.1";
}

export function resolveTerminalRuntimeBase(): string {
  if (selectedRuntime) return selectedRuntime.base;
  return runtimeHttpOrigin(resolveTerminalRuntimeHost(), resolveTerminalRuntimePort());
}

export function resolveTerminalWebSocketUrl(): string {
  const url = new URL(resolveTerminalRuntimeBase());
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/v1/terminal/ws";
  return url.toString();
}

export type TerminalRuntimeEnsureResult = {
  ok: boolean;
  base?: string;
  port?: number;
  message?: string;
};

const DIRECT_HEALTH_TIMEOUT_MS = 700;
const DIRECT_HEALTH_PROBE_ATTEMPTS = 12;
const DIRECT_HEALTH_PROBE_INTERVAL_MS = 120;

let runtimeWarmup: Promise<boolean> | null = null;
let xtermChunkWarmup: Promise<unknown> | null = null;

/** @internal test helper */
export function resetTerminalRuntimeWarmupForTests(): void {
  runtimeWarmup = null;
  selectedRuntime = undefined;
}

/** Drop cached warmup so the next connect re-probes /api/terminal/runtime. */
export function invalidateTerminalRuntimeWarmup(): void {
  runtimeWarmup = null;
}

/** Warm terminal-runtime once per page load. */
export function warmupTerminalRuntime(): Promise<boolean> {
  if (!runtimeWarmup) {
    runtimeWarmup = ensureTerminalRuntime().then((result) => {
      if (!result.ok) {
        runtimeWarmup = null;
        return false;
      }
      return true;
    });
  }
  return runtimeWarmup;
}

/** Preload xterm bundles after first terminal open. */
export function warmupXtermChunks(): Promise<unknown> {
  if (!xtermChunkWarmup) {
    xtermChunkWarmup = Promise.all([
      import("@xterm/xterm"),
      import("@xterm/addon-fit"),
    ]);
  }
  return xtermChunkWarmup;
}

/** Skip Next.js spawn hop when terminal-runtime is already listening. */
async function probeTerminalRuntimeDirect(): Promise<TerminalRuntimeEnsureResult | null> {
  if (typeof window === "undefined" || !selectedRuntime) return null;
  const base = resolveTerminalRuntimeBase();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DIRECT_HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/health`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { ok?: boolean; runtimeOwner?: string };
    if (body.ok !== true || selectedRuntime.runtimeOwner && body.runtimeOwner !== selectedRuntime.runtimeOwner) return null;
    return {
      ok: true,
      base,
      port: Number(new URL(base).port),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function probeTerminalRuntimeDirectWithRetry(): Promise<TerminalRuntimeEnsureResult | null> {
  if (!selectedRuntime) return null;
  for (let attempt = 0; attempt < DIRECT_HEALTH_PROBE_ATTEMPTS; attempt += 1) {
    const direct = await probeTerminalRuntimeDirect();
    if (direct?.ok) return direct;
    if (attempt + 1 < DIRECT_HEALTH_PROBE_ATTEMPTS) {
      await sleep(DIRECT_HEALTH_PROBE_INTERVAL_MS);
    }
  }
  return null;
}

export async function ensureTerminalRuntime(): Promise<TerminalRuntimeEnsureResult> {
  const direct = await probeTerminalRuntimeDirectWithRetry();
  if (direct?.ok) return direct;

  try {
    const res = await fetch("/api/terminal/runtime", {
      method: "POST",
      cache: "no-store",
    });
    const body = (await res.json()) as {
      ok?: boolean;
      base?: string;
      port?: number;
      message?: string;
      runtimeOwner?: string;
    };
    if (!res.ok || body.ok !== true) {
      return {
        ok: false,
        message: body.message ?? `terminal runtime HTTP ${res.status}`,
      };
    }
    const base = typeof body.base === "string" ? body.base : resolveTerminalRuntimeBase();
    selectedRuntime = { base, runtimeOwner: body.runtimeOwner };
    return {
      ok: true,
      base,
      port: typeof body.port === "number" ? body.port : Number(new URL(base).port),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}

export const TERMINAL_PROTOCOL_VERSION = "quicker-terminal-v3";

export type TerminalSessionInfo = {
  sessionId: string;
  shell: string;
  cwd: string;
  status: "running" | "exited";
  exitCode?: number;
};

export type TerminalSocketMessage =
  | { type: "create"; sessionId?: string; cwd?: string; cols: number; rows: number }
  | { type: "attach"; sessionId: string; cwd?: string; cols?: number; rows?: number }
  | { type: "detach"; sessionId: string }
  | { type: "list" }
  | { type: "input"; sessionId: string; data: string }
  | { type: "resize"; sessionId: string; cols: number; rows: number }
  | { type: "dispose"; sessionId: string };

export type TerminalServerMessage =
  | {
      type: "connected";
      protocolVersion: string;
      sessions: TerminalSessionInfo[];
    }
  | {
      type: "sessions";
      sessions: TerminalSessionInfo[];
    }
  | {
      type: "ready";
      sessionId: string;
      shell: string;
      cwd: string;
      status?: "running" | "exited";
      exitCode?: number;
      replay?: string;
    }
  | { type: "output"; sessionId: string; data: string }
  | { type: "exit"; sessionId: string; code: number }
  | { type: "detached"; sessionId: string }
  | { type: "disposed"; sessionId: string }
  | { type: "warmed" }
  | { type: "error"; message: string };
