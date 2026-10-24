import "server-only";
import { traceBridge, traceTerminalSummary } from "./action-trace-bridge.server";
import { readTraceRunOwner } from "./action-trace-owner";
import { formatTraceEventLine } from "./action-trace-format";
import { consumeActionTraceSseResponse } from "./action-trace-sse-core";
import { resolveQkrpcHttpBase, resolveQkrpcHttpBinding } from "./qkrpc-http";
import { currentQkrpcTarget, bindingFailure } from "./qkrpc-host-binding";
import { qkrpcRequestContext } from "./qkrpc-request-context";
import { resolveRequestAbortSignal } from "./request-abort-signal";
import type { QkrpcRunResult } from "./qkrpc-types";
import type { InlineXActionProgram } from "./action-trace-inline-programs";
export type OwnedTraceInput = { id: string; param?: string; xaction?: InlineXActionProgram };
export type TraceExecutionOptions = { toolCallId?: string; abortSignal?: AbortSignal };
/** Each request keeps the native dedicated pipe/progress/logger invocation intact. */
export async function prepareOwnedActionTrace(input: OwnedTraceInput, options?: TraceExecutionOptions) {
  const abortSignal = resolveRequestAbortSignal(options?.abortSignal);
  abortSignal?.throwIfAborted();
  const context = qkrpcRequestContext.getStore();
  const port = context?.traceExecution;
  if (!port || !context?.threadId || !context.cwd || context.executionState?.closed)
    return bindingFailure("TRACE_OWNER_REQUIRED", "Agent trace requires an owned request execution context.");
  const actionId = input.id.trim();
  const param = input.param?.trim() || undefined;
  const target = currentQkrpcTarget();
  if (target?.gateway === "cli")
    return bindingFailure("HOST_BINDING_REQUIRED", "Trace requires the turn's HTTP gateway; start a new HTTP-bound turn explicitly.");
  const base = target?.gateway ?? resolveQkrpcHttpBase();
  const timeout = AbortSignal.timeout(300000);
  const signal = abortSignal ? AbortSignal.any([abortSignal, timeout]) : timeout;
  const resolved = target?.binding ?? await resolveQkrpcHttpBinding(base, { op: "action.run", args: {} }, signal);
  abortSignal?.throwIfAborted();
  if (!resolved || "exitCode" in resolved)
    return resolved ?? bindingFailure("HOST_BINDING_REQUIRED", "Trace requires a verified host binding.");
  const owner = readTraceRunOwner({ version: 1, runId: port.createRunId(), executionId: port.executionId,
    threadId: context.threadId, cwd: context.cwd, actionId, param, hostBinding: resolved,
    toolCallId: options?.toolCallId, invocationPath: context.traceInvocationPath ?? [] })!;
  if (!owner)
    return bindingFailure("TRACE_OWNER_REQUIRED", "Invalid trace execution identity.");
  let started = false, dispatched = false;
  return { owner, didDispatch: () => dispatched, run: async (): Promise<QkrpcRunResult> => {
  if (started) throw new Error("Trace execution has already started.");
  started = true;
  traceBridge.start(owner);
  context.traceRuns?.push(owner);
  let terminal: Record<string, unknown> | undefined;
  const finish = (data: Record<string, unknown>) => {
    if (terminal)
      return;
    terminal = { ...data, traceOwner: owner };
    traceBridge.finish(owner, terminal);
    port.emit({ kind: "terminal", owner, data: { ...traceTerminalSummary(terminal), traceOwner: owner } });
  };
  try {
    port.emit({ kind: "start", owner });
    signal.throwIfAborted();
    dispatched = true;
    const response = await fetch(`${base}/v1/action/trace/stream`, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ id: actionId, param, ...(input.xaction ? { xaction: input.xaction } : {}), timeoutSeconds: 300, hostBinding: owner.hostBinding }), signal, cache: "no-store",
    });
    signal.throwIfAborted();
    await consumeActionTraceSseResponse(response, signal, {
      onTrace: (event) => {
        if (signal.aborted || terminal || context.executionState?.closed)
          return;
        if (traceBridge.event(owner, event))
          traceBridge.line(owner, formatTraceEventLine(event));
      },
      // Native emits a line for each trace event through both callback paths.
      // Derive it once above from the accepted per-run sequence instead.
      onDone: finish,
      onError: (message) => finish({ ok: false, error: "WRITE_RESULT_UNKNOWN", message, retryable: false }),
    });
    signal.throwIfAborted();
    if (!terminal)
      finish({ ok: false, error: "WRITE_RESULT_UNKNOWN", retryable: false, message: "trace finished without payload" });
  }
  catch (error) {
    finish({ ok: false, error: dispatched ? "WRITE_RESULT_UNKNOWN" : "HOST_UNAVAILABLE", retryable: false,
      message: error instanceof Error ? error.message : String(error) });
    abortSignal?.throwIfAborted();
  }
  finally {
    if (!terminal)
      finish({ ok: false, error: "WRITE_RESULT_UNKNOWN", retryable: false, message: "trace observation ended" });
  }
  const payload = terminal!;
  return { ok: payload.ok === true, exitCode: payload.ok === true ? 0 : 1,
    stdout: JSON.stringify(payload), stderr: payload.ok === true ? "" : String(payload.message ?? "trace failed"), parsed: payload, truncated: false };
  } };
}
export async function runActionTraceForAgentTool(input: { id: string; param?: string }, options?: TraceExecutionOptions): Promise<QkrpcRunResult> {
  const prepared = await prepareOwnedActionTrace(input, options);
  return "run" in prepared ? prepared.run() : prepared;
}
