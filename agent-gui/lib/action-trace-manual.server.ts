import "server-only";
import { randomUUID } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { createTurnExecutionState, disposeTurnExecutionState } from "./agent-harness/turn-execution-state";
import { findActionProjectBinding, pinActionProjectBinding, readActionProjectBinding, requireActionProjectBinding } from "./action-project-host-binding.server";
import { sameActionProjectBinding } from "./action-project-binding";
import { ManualTraceError, type ManualTraceRequest } from "./action-trace-manual-contract";
import type { TraceRunOwner } from "./action-trace-owner";
import { prepareOwnedActionTrace } from "./action-trace-stream.server";
import { traceBridge } from "./action-trace-bridge.server";
import { qkrpcRequestContext } from "./qkrpc-request-context";

type Entry = { abort: AbortController; done: Promise<void>; owner?: TraceRunOwner; releaseRequest: () => void; retire: () => void };
export function createManualTraceManager(deps: {
  createId: () => string;
  prepare?: typeof prepareOwnedActionTrace;
  validateCwd?: (cwd: string) => Promise<string>;
  validateTarget?: (input: ManualTraceRequest) => Promise<(() => Promise<void>) | undefined>;
  timeoutMs?: number;
  stopTimeoutMs?: number;
}) {
  const entries = new Set<Entry>();
  let closed = false, stopping: Promise<void> | undefined;
  const prepare = deps.prepare ?? prepareOwnedActionTrace;
  return {
    async start(input: ManualTraceRequest, requestSignal: AbortSignal) {
      requestSignal.throwIfAborted();
      if (closed) throw new ManualTraceError("TRACE_SERVICE_CLOSED", "Trace service is stopped.", 503);
      const abort = new AbortController();
      let finish!: () => void;
      const done = new Promise<void>((resolve) => { finish = resolve; });
      const requestAborted = () => abort.abort(requestSignal.reason);
      requestSignal.addEventListener("abort", requestAborted, { once: true });
      const state = createTurnExecutionState();
      const entry: Entry = { abort, done, releaseRequest: () => requestSignal.removeEventListener("abort", requestAborted), retire: () => { state.closed = true; } };
      entries.add(entry);
      const timer = setTimeout(() => abort.abort(new Error("Trace observation timed out; the native result is unknown.")), deps.timeoutMs ?? 300000);
      const cleanup = () => { clearTimeout(timer); entry.releaseRequest(); entries.delete(entry); disposeTurnExecutionState(state); finish(); };
      try {
        const executionId = deps.createId();
        const cwd = await (deps.validateCwd ?? validateManualTraceCwd)(input.cwd);
        abort.signal.throwIfAborted();
        const scope = { cwd, threadId: `manual:${executionId}`, executionState: state, abortSignal: abort.signal,
          traceExecution: { executionId, createRunId: deps.createId, emit() {} }, traceInvocationPath: [], traceRuns: [], traceRefs: [] };
        const prepared = await qkrpcRequestContext.run(scope, async () => {
          const recheck = await (deps.validateTarget ?? validateManualTraceTarget)(input);
          abort.signal.throwIfAborted();
          const result = await prepare({ id: input.xaction ? `ephemeral:${executionId}` : input.actionId, param: input.param, xaction: input.xaction }, { abortSignal: abort.signal });
          abort.signal.throwIfAborted();
          if ("run" in result) await recheck?.();
          abort.signal.throwIfAborted();
          return result;
        });
        if (!("run" in prepared)) throw new ManualTraceError(String((prepared.parsed as { error?: string } | undefined)?.error ?? "HOST_BINDING_REQUIRED"), prepared.stderr || "Trace target is unavailable.");
        if (closed) throw new ManualTraceError("TRACE_SERVICE_CLOSED", "Trace service is stopped.", 503);
        entry.owner = prepared.owner;
        const observationEnded = () => traceBridge.finish(prepared.owner, { ok: false, error: "WRITE_RESULT_UNKNOWN", retryable: false,
          message: abort.signal.reason instanceof Error ? abort.signal.reason.message : "Trace observation ended; the native result is unknown." });
        abort.signal.addEventListener("abort", observationEnded, { once: true });
        // One invocation promise, not an Agent loop. ACK loss never starts another invocation.
        void qkrpcRequestContext.run(scope, () => prepared.run()).catch(() => { observationEnded(); }).finally(() => {
          abort.signal.removeEventListener("abort", observationEnded); cleanup();
        });
        return { owner: prepared.owner, didDispatch: prepared.didDispatch, acknowledge() { entry.releaseRequest(); } };
      } catch (error) { cleanup(); throw error; }
    },
    stop() {
      if (stopping) return stopping;
      let resolve!: () => void, reject!: (error: unknown) => void;
      // Publish before abort listeners can synchronously reenter stop().
      stopping = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
      closed = true;
      const owned = [...entries];
      for (const entry of owned) { entry.retire(); entry.abort.abort(new Error("Trace service stopped observing; the native result is unknown.")); }
      const deadline = setTimeout(() => reject(new ManualTraceError("TRACE_SHUTDOWN_TIMEOUT", "Node trace observation cleanup has not settled; native execution may still be running.", 503)), deps.stopTimeoutMs ?? 2000);
      void Promise.all(owned.map((entry) => entry.done)).then(() => { clearTimeout(deadline); resolve(); }, (error) => { clearTimeout(deadline); reject(error); });
      // Timed-out entries remain owned until their real promises settle and cleanup releases them.
      return stopping;
    },
    size: () => entries.size,
  };
}
async function validateManualTraceCwd(cwd: string) {
  if (!isAbsolute(cwd)) throw new ManualTraceError("INVALID_WORKING_DIRECTORY", "An absolute working directory is required.", 400);
  try {
    const canonical = await realpath(cwd);
    if ((await stat(canonical)).isDirectory()) return canonical;
  } catch { /* Missing/inaccessible directories never fall back to an ambient profile. */ }
  throw new ManualTraceError("INVALID_WORKING_DIRECTORY", "Working directory is unavailable or is not a directory.", 400);
}
async function validateManualTraceTarget(input: ManualTraceRequest): Promise<(() => Promise<void>) | undefined> {
  if (input.expectedProjectBinding === null) throw new ManualTraceError("HOST_BINDING_REQUIRED", "An unbound project cannot run on a host.");
  const id = input.xaction ? input.expectedProjectBinding?.actionId : input.actionId;
  if (input.projectDirectory && !id) throw new ManualTraceError("HOST_BINDING_REQUIRED", "Inline document trace requires its complete project target.");
  const project = input.projectDirectory && id
    ? input.expectedProjectBinding
      ? await requireActionProjectBinding(id, { projectDirectory: input.projectDirectory, projectBinding: input.expectedProjectBinding })
      : { directory: input.projectDirectory, record: await readActionProjectBinding(input.projectDirectory, id) }
    : !input.xaction ? await findActionProjectBinding(input.actionId) : undefined;
  if (!project) return;
  pinActionProjectBinding(project.record.hostBinding);
  return async () => {
    const current = await readActionProjectBinding(project.directory, project.record.actionId);
    if (!sameActionProjectBinding(current, project.record)) throw new ManualTraceError("PROJECT_IDENTITY_CONFLICT", "Project target changed while preparing the trace.");
  };
}
export const manualTraceManager = createManualTraceManager({ createId: randomUUID });
export const stopManualTraceRuns = () => manualTraceManager.stop();
