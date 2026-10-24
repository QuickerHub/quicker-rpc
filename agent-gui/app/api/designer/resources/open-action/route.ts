import { openDesignerResourceAction } from "@/lib/designer-resource-action-open.server";

export const dynamic = "force-dynamic";
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ ok: false, code: "INVALID_RESOURCE_OPEN_REQUEST", error: "A JSON request is required.", retryable: false, localPersistence: "none" }, { status: 400 }); }
  const result = await openDesignerResourceAction(body, { signal: req.signal });
  // Local persistence receipts survive request cancellation and source-document changes.
  return Response.json(result, { status: result.ok ? 200 : result.code === "REQUEST_ABORTED" ? 499
    : result.code === "INVALID_RESOURCE_OPEN_REQUEST" ? 400 : result.localPersistence === "unknown" || result.localPersistence === "partial" ? 503 : 409 });
}
