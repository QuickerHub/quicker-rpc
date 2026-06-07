"use client";

import { startActionTraceStream } from "@/lib/action-trace-overlay";

/** Terminal step debug — agent tool `debug` and UI side panel. */

export type StartActionTraceOptions = {
  actionId: string;
  param?: string;
  actionTitle?: string;
};

export type StartActionTraceResult =
  | { ok: true }
  | { ok: false; error: string };

/** Open trace overlay and stream lines via fetch SSE (direct qkrpc serve). */
export function startActionTrace(
  options: StartActionTraceOptions,
): StartActionTraceResult {
  const actionId = options.actionId.trim();
  if (!actionId) {
    return { ok: false, error: "缺少动作 id" };
  }

  startActionTraceStream({
    actionId,
    param: options.param,
    actionTitle: options.actionTitle,
  });

  return { ok: true };
}
