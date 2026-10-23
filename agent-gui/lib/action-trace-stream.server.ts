import "server-only";

import { buildActionTraceTabId } from "@/lib/action-trace-tab-id";
import {
  ensureTraceBridgeSession,
  failTraceBridgeSession,
  finishTraceBridgeSession,
  publishTraceBridgeEvent,
  publishTraceBridgeLine,
} from "@/lib/action-trace-bridge.server";
import { consumeActionTraceSseResponse } from "@/lib/action-trace-sse-core";
import { resolveQkrpcHttpBase, resolveQkrpcHttpBinding } from "@/lib/qkrpc-http";
import { currentQkrpcTarget, bindingFailure } from "@/lib/qkrpc-host-binding";
import { resolveRequestAbortSignal } from "@/lib/request-abort-signal";
import type { QkrpcRunResult } from "@/lib/qkrpc-types";

const TRACE_TIMEOUT_SECONDS = 300;

/** Run trace once via qkrpc serve SSE and fan-out to the browser bridge. */
export async function runActionTraceForAgentTool(input: {
  id: string;
  param?: string;
}): Promise<QkrpcRunResult> {
  const abortSignal = resolveRequestAbortSignal();
  abortSignal?.throwIfAborted();
  const actionId = input.id.trim();
  const param = input.param?.trim() || undefined;
  const tabId = buildActionTraceTabId(actionId, param);
  ensureTraceBridgeSession(tabId);

  const target = currentQkrpcTarget();
  if (target?.gateway === "cli") return bindingFailure("HOST_BINDING_REQUIRED", "Trace requires the turn's HTTP gateway; start a new HTTP-bound turn explicitly.");
  const base = target?.gateway ?? resolveQkrpcHttpBase();
  let res: Response;
  let dispatched = false;
  const timeout = AbortSignal.timeout(TRACE_TIMEOUT_SECONDS * 1000);
  const signal = abortSignal ? AbortSignal.any([abortSignal, timeout]) : timeout;
  try {
    const resolved = target?.binding ?? await resolveQkrpcHttpBinding(base, { op: "action.run", args: {} }, signal);
    if (!resolved || "exitCode" in resolved)
      return resolved ?? bindingFailure("HOST_BINDING_REQUIRED", "Trace requires a verified host binding.");
    dispatched = true;
    res = await fetch(`${base}/v1/action/trace/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        id: actionId,
        param,
        timeoutSeconds: TRACE_TIMEOUT_SECONDS,
        hostBinding: resolved,
      }),
      signal,
      cache: "no-store",
    });
    abortSignal?.throwIfAborted();
  } catch (err) {
    abortSignal?.throwIfAborted();
    const message = err instanceof Error ? err.message : String(err);
    failTraceBridgeSession(tabId, message);
    return {
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: message,
      parsed: { ok: false, error: dispatched ? "WRITE_RESULT_UNKNOWN" : "HOST_UNAVAILABLE", message, retryable: false },
      truncated: false,
    };
  }

  let donePayload: Record<string, unknown> | null = null;
  let errorMessage: string | null = null;

  try {
    await consumeActionTraceSseResponse(res, signal, {
      onLine: (line) => {
        publishTraceBridgeLine(tabId, line);
      },
      onTrace: (event) => {
        publishTraceBridgeEvent(tabId, event);
      },
      onDone: (data) => {
        donePayload = data;
        finishTraceBridgeSession(tabId, data);
      },
      onError: (message) => {
        errorMessage = message;
        failTraceBridgeSession(tabId, message);
      },
    });
    abortSignal?.throwIfAborted();
  } catch (err) {
    abortSignal?.throwIfAborted();
    errorMessage = err instanceof Error ? err.message : String(err);
    failTraceBridgeSession(tabId, errorMessage);
  }

  if (errorMessage) {
    return {
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: errorMessage,
      parsed: { ok: false, error: "WRITE_RESULT_UNKNOWN", message: errorMessage, retryable: false },
      truncated: false,
    };
  }

  const payload = donePayload ?? { ok: false, error: "WRITE_RESULT_UNKNOWN", retryable: false, message: "trace finished without payload" };
  return {
    ok: payload.ok === true,
    exitCode: payload.ok === true ? 0 : 1,
    stdout: JSON.stringify(payload),
    stderr: "",
    parsed: payload,
    truncated: false,
  };
}
