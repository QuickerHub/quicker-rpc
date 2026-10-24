import { readManualTraceRequest, ManualTraceError } from "@/lib/action-trace-manual-contract";
import { manualTraceManager } from "@/lib/action-trace-manual.server";
import { ActionProjectBindingError } from "@/lib/action-project-binding";
import { GET as observeTrace } from "../feed/route";

export const runtime = "nodejs";
/** GET observes a known run; reading history must never dispatch an action. */
export const GET = observeTrace;
export async function POST(req: Request) {
  let accepted: Awaited<ReturnType<typeof manualTraceManager.start>> | undefined;
  try {
    req.signal.throwIfAborted();
    let body: unknown;
    try { body = await req.json(); } catch (error) { req.signal.throwIfAborted(); throw new ManualTraceError("INVALID_JSON", error instanceof Error ? error.message : "Invalid JSON", 400); }
    accepted = await manualTraceManager.start(readManualTraceRequest(body), req.signal);
    req.signal.throwIfAborted();
    const response = Response.json({ ok: true, owner: accepted.owner }, { status: 202 });
    // After acceptance, normal response completion does not own the invocation lifetime.
    accepted.acknowledge();
    return response;
  } catch (error) {
    const possibleDispatch = accepted?.didDispatch() === true;
    const facts = { dispatchStatus: possibleDispatch ? "possibly-dispatched" : "not-dispatched", ...(accepted ? { owner: accepted.owner } : {}) };
    if (req.signal.aborted) return Response.json({ ok: false, code: possibleDispatch ? "WRITE_RESULT_UNKNOWN" : "REQUEST_ABORTED", error: req.signal.reason instanceof Error ? req.signal.reason.message : "Request aborted", ...facts, retryable: false }, { status: 499 });
    const code = error instanceof ManualTraceError || error instanceof ActionProjectBindingError ? error.code : "TRACE_START_FAILED";
    return Response.json({ ok: false, code, error: error instanceof Error ? error.message : String(error), ...facts, retryable: false }, { status: error instanceof ManualTraceError ? error.status : error instanceof ActionProjectBindingError ? 409 : 500 });
  }
}
