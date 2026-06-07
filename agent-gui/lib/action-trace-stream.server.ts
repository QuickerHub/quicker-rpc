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
import { resolveQkrpcHttpBase } from "@/lib/qkrpc-http";
import type { QkrpcRunResult } from "@/lib/qkrpc-types";

const TRACE_TIMEOUT_SECONDS = 300;

/** Run trace once via qkrpc serve SSE and fan-out to the browser bridge. */
export async function runActionTraceForAgentTool(input: {
  id: string;
  param?: string;
}): Promise<QkrpcRunResult> {
  const actionId = input.id.trim();
  const param = input.param?.trim() || undefined;
  const tabId = buildActionTraceTabId(actionId, param);
  ensureTraceBridgeSession(tabId);

  const base = resolveQkrpcHttpBase();
  let res: Response;
  try {
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
      }),
      cache: "no-store",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failTraceBridgeSession(tabId, message);
    return {
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: message,
      parsed: { ok: false, message },
      truncated: false,
    };
  }

  let donePayload: Record<string, unknown> | null = null;
  let errorMessage: string | null = null;

  await consumeActionTraceSseResponse(res, undefined, {
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

  if (errorMessage) {
    return {
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: errorMessage,
      parsed: { ok: false, message: errorMessage },
      truncated: false,
    };
  }

  const payload = donePayload ?? { ok: false, message: "trace finished without payload" };
  return {
    ok: payload.ok === true,
    exitCode: payload.ok === true ? 0 : 1,
    stdout: JSON.stringify(payload),
    stderr: "",
    parsed: payload,
    truncated: false,
  };
}
