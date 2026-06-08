"use client";

import type { InlineXActionProgram } from "@/lib/action-trace-inline-programs";
import { startActionTraceStream } from "@/lib/action-trace-overlay";

/** Terminal step debug — agent tool `debug` and UI side panel. */

export type StartActionTraceOptions = {
  actionId: string;
  param?: string;
  actionTitle?: string;
  /** When set, runs ephemeral program JSON instead of a saved Quicker action. */
  xaction?: InlineXActionProgram;
};

export type StartActionTraceResult =
  | { ok: true }
  | { ok: false; error: string };

/** Open trace overlay and stream lines via fetch SSE (direct qkrpc serve). */
export function startActionTrace(
  options: StartActionTraceOptions,
): StartActionTraceResult {
  const actionId = options.actionId.trim();
  if (!actionId && !options.xaction) {
    return { ok: false, error: "缺少动作 id 或内联程序" };
  }

  startActionTraceStream({
    actionId: actionId || options.xaction?.title || "inline",
    param: options.param,
    actionTitle: options.actionTitle,
    xaction: options.xaction,
  });

  return { ok: true };
}
