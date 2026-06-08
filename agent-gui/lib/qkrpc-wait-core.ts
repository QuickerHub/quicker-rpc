import { invokeQkrpcHttp } from "@/lib/qkrpc-http";
import {
  formatQkrpcResultForAgent,
  runQkrpcCliDirect,
  type QkrpcRunResult,
} from "@/lib/qkrpc";
import {
  isQkrpcConnectivityFailure,
} from "@/lib/qkrpc-connectivity";
import { invalidateServeProbeCache } from "@/lib/qkrpc-transport";

export type QkrpcWaitToolInput = {
  timeoutSeconds?: number;
  intervalSeconds?: number;
  noBootstrap?: boolean;
};

export type QkrpcWaitRecoveryPhase = {
  serveEnsureAttempted: boolean;
  serveReadyBeforeWait: boolean;
  transport: "http" | "cli";
  cliFallbackReason?: string;
};

export function buildWaitCliArgs(input: QkrpcWaitToolInput): string[] {
  const timeout = input.timeoutSeconds ?? 120;
  const interval = input.intervalSeconds ?? 2;
  const args = [
    "wait",
    "--timeout",
    String(timeout),
    "--interval",
    String(interval),
    "--json",
  ];
  if (input.noBootstrap) args.push("--no-bootstrap");
  return args;
}

function waitHttpTimeoutMs(input: QkrpcWaitToolInput): number {
  const timeout = input.timeoutSeconds ?? 120;
  return timeout * 1000 + 25_000;
}

function isServeUnreachable(result: QkrpcRunResult): boolean {
  if (result.ok) return false;
  const stderr = (result.stderr ?? "").toLowerCase();
  if (stderr.includes("无法连接 qkrpc serve")) return true;
  if (stderr.includes("fetch failed")) return true;
  if (stderr.includes("econnrefused")) return true;
  if (stderr.includes("aborterror") || stderr.includes("aborted")) return true;
  return false;
}

async function tryEnsureServe(): Promise<boolean> {
  try {
    const { ensureQkrpcServeIfDown } = await import("@/lib/qkrpc-serve-ensure.mjs");
    return await ensureQkrpcServeIfDown();
  } catch {
    return false;
  }
}

async function runWaitViaHttp(
  input: QkrpcWaitToolInput,
): Promise<QkrpcRunResult | null> {
  const timeoutMs = waitHttpTimeoutMs(input);
  return invokeQkrpcHttp(
    {
      op: "wait",
      args: {
        timeoutSeconds: input.timeoutSeconds ?? 120,
        intervalSeconds: input.intervalSeconds ?? 2,
        noBootstrap: input.noBootstrap === true,
      },
    },
    { timeoutMs },
  );
}

function enrichWaitPayload(
  payload: Record<string, unknown>,
  phase: QkrpcWaitRecoveryPhase,
): Record<string, unknown> {
  const data =
    typeof payload.data === "object" && payload.data !== null && !Array.isArray(payload.data)
      ? { ...(payload.data as Record<string, unknown>) }
      : {};
  return {
    ...payload,
    data: {
      ...data,
      recovery: phase,
    },
  };
}

/**
 * Wait until QuickerRpc is reachable: ensure serve, HTTP wait (with bootstrap),
 * then CLI fallback (also runs quicker:runaction bootstrap when pipe is down).
 */
export async function executeRobustQkrpcWait(
  input: QkrpcWaitToolInput,
): Promise<Record<string, unknown>> {
  invalidateServeProbeCache();

  const phase: QkrpcWaitRecoveryPhase = {
    serveEnsureAttempted: false,
    serveReadyBeforeWait: false,
    transport: "http",
  };

  phase.serveEnsureAttempted = true;
  phase.serveReadyBeforeWait = await tryEnsureServe();
  invalidateServeProbeCache();

  const timeoutMs = waitHttpTimeoutMs(input);
  let result = await runWaitViaHttp(input);

  if (result === null) {
    phase.serveEnsureAttempted = true;
    phase.serveReadyBeforeWait = (await tryEnsureServe()) || phase.serveReadyBeforeWait;
    invalidateServeProbeCache();
    result = await runWaitViaHttp(input);
  }

  if (result !== null && result.ok) {
    return enrichWaitPayload(formatQkrpcResultForAgent(result), phase);
  }

  const shouldCliFallback =
    result === null
    || isServeUnreachable(result)
    || (result !== null && !result.ok && isQkrpcConnectivityFailure(result));

  if (shouldCliFallback) {
    phase.transport = "cli";
    phase.cliFallbackReason =
      result === null
        ? "serve_unreachable"
        : isServeUnreachable(result)
          ? "serve_unreachable"
          : "connectivity_failure";
    const cliResult = await runQkrpcCliDirect(buildWaitCliArgs(input), {
      timeoutMs,
      json: true,
    });
    return enrichWaitPayload(formatQkrpcResultForAgent(cliResult), phase);
  }

  return enrichWaitPayload(
    formatQkrpcResultForAgent(
      result ?? {
        ok: false,
        exitCode: 1,
        stdout: "",
        stderr: "qkrpc wait failed (no HTTP response)",
        parsed: null,
        truncated: false,
      },
    ),
    phase,
  );
}
