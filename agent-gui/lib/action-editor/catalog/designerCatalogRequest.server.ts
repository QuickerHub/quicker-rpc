import { runWithAgentRequestContextAsync } from "../../qkrpc-request-context";
import { resolveRequestAbortSignal } from "../../request-abort-signal";
import { createTurnExecutionState, disposeTurnExecutionState } from "../../agent-harness/turn-execution-state";
import { requireActionProjectBinding, readActionProjectBinding } from "../../action-project-host-binding.server";
import { sameActionProjectBinding } from "../../action-project-binding";
import type { QkrpcRunOptions } from "../../qkrpc";
import type { QkrpcRunResult } from "../../qkrpc-types";
import { DesignerCatalogError, designerCatalogFailure, readDesignerCatalogContext, type DesignerCatalogScope } from "./designerCatalogContext";

export type DesignerCatalogRequest = {
  scope: DesignerCatalogScope;
  bound: boolean;
  rpcOptions: Pick<QkrpcRunOptions, "abortSignal" | "hostBinding">;
};

/** A bound request cannot convert transport/identity failure into another host's static schema. */
export function requireDesignerCatalogResult(result: QkrpcRunResult | null, request: DesignerCatalogRequest): void {
  request.rpcOptions.abortSignal?.throwIfAborted();
  const payload = result?.parsed as { ok?: unknown; success?: unknown; payload?: { success?: unknown; errorMessage?: string }; code?: unknown; errorCode?: unknown; error?: unknown } | null;
  if (!request.bound || (result?.ok && payload?.ok !== false && payload?.success !== false && payload?.payload?.success !== false)) return;
  const candidate = payload?.code ?? payload?.errorCode ?? payload?.error;
  const code = typeof candidate === "string" && /^[A-Z][A-Z0-9_]+$/.test(candidate) ? candidate : "CATALOG_REQUEST_FAILED";
  throw new DesignerCatalogError(code, result?.stderr || payload?.payload?.errorMessage || "The bound host catalog is unavailable.", 503);
}

export async function runDesignerCatalogRequest(req: Request, envelope: unknown,
  run: (request: DesignerCatalogRequest) => Promise<Response>): Promise<Response> {
  const abortSignal = resolveRequestAbortSignal(req.signal);
  const executionState = createTurnExecutionState();
  try {
    abortSignal?.throwIfAborted();
    const scope = readDesignerCatalogContext(envelope);
    return await runWithAgentRequestContextAsync({ cwd: scope?.cwd, abortSignal, executionState }, async () => {
      if (scope === null) throw new DesignerCatalogError("PROJECT_IDENTITY_LOADING", "The document target has not been resolved.");
      if (scope && !scope.expectedProjectBinding) throw new DesignerCatalogError("HOST_BINDING_REQUIRED", "An unbound local document cannot query a host catalog.");
      const target = scope?.expectedProjectBinding ? { projectDirectory: scope.projectDirectory, projectBinding: scope.expectedProjectBinding } : undefined;
      const verified = target ? await requireActionProjectBinding(target.projectBinding.actionId, target) : undefined;
      abortSignal?.throwIfAborted();
      const response = await run({ scope, bound: Boolean(verified), rpcOptions: { abortSignal,
        ...(verified ? { hostBinding: verified.record.hostBinding } : {}) } });
      abortSignal?.throwIfAborted();
      if (verified && !sameActionProjectBinding(verified.record,
        await readActionProjectBinding(verified.directory, verified.record.actionId))) {
        throw new DesignerCatalogError("PROJECT_IDENTITY_CONFLICT", "The document target changed while its catalog was loading.");
      }
      abortSignal?.throwIfAborted();
      if (verified && !response.ok) {
        const body = await response.json() as Record<string, unknown>;
        return Response.json({ ...body, code: typeof body.code === "string" ? body.code
          : response.status === 400 ? "INVALID_CATALOG_REQUEST" : "CATALOG_REQUEST_FAILED", retryable: false }, { status: response.status });
      }
      return response;
    });
  } catch (error) {
    if (abortSignal?.aborted) return Response.json({ ...designerCatalogFailure(abortSignal.reason), code: "REQUEST_ABORTED" }, { status: 499 });
    const failure = designerCatalogFailure(error);
    return Response.json(failure, { status: error instanceof DesignerCatalogError ? error.status : failure.code === "CATALOG_REQUEST_FAILED" ? 500 : 409 });
  } finally { disposeTurnExecutionState(executionState); }
}

export async function postDesignerCatalogRequest(req: Request,
  run: (body: Record<string, unknown>, request: DesignerCatalogRequest) => Promise<Response>): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); }
  catch (error) {
    return runDesignerCatalogRequest(req, {}, async () => { throw new DesignerCatalogError("INVALID_CATALOG_REQUEST", error instanceof Error ? error.message : "Invalid JSON body.", 400); });
  }
  return runDesignerCatalogRequest(req, body, async (request) => {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new DesignerCatalogError("INVALID_CATALOG_REQUEST", "A JSON object is required.", 400);
    return run(body as Record<string, unknown>, request);
  });
}
