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
  const host = resolveTerminalRuntimeHost();
  const port = resolveTerminalRuntimePort();
  return `http://${host}:${port}`;
}

export function resolveTerminalWebSocketUrl(): string {
  const host = resolveTerminalRuntimeHost();
  const port = resolveTerminalRuntimePort();
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${host}:${port}/v1/terminal/ws`;
}

export type TerminalRuntimeEnsureResult = {
  ok: boolean;
  base?: string;
  port?: number;
  message?: string;
};

const DIRECT_HEALTH_TIMEOUT_MS = 700;

let runtimeWarmup: Promise<boolean> | null = null;
let xtermChunkWarmup: Promise<unknown> | null = null;

/** Warm terminal-runtime once per page load. */
export function warmupTerminalRuntime(): Promise<boolean> {
  if (!runtimeWarmup) {
    runtimeWarmup = ensureTerminalRuntime().then((result) => result.ok);
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
  if (typeof window === "undefined") return null;
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
    const body = (await res.json()) as { ok?: boolean };
    if (body.ok !== true) return null;
    return {
      ok: true,
      base,
      port: resolveTerminalRuntimePort(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function ensureTerminalRuntime(): Promise<TerminalRuntimeEnsureResult> {
  const direct = await probeTerminalRuntimeDirect();
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
    };
    if (!res.ok || body.ok !== true) {
      return {
        ok: false,
        message: body.message ?? `terminal runtime HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      base: typeof body.base === "string" ? body.base : resolveTerminalRuntimeBase(),
      port: typeof body.port === "number" ? body.port : resolveTerminalRuntimePort(),
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
