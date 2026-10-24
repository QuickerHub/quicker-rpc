import { runQkrpc } from "@/lib/qkrpc";
import { DesignerCatalogError } from "@/lib/action-editor/catalog/designerCatalogContext";
import { postDesignerCatalogRequest, requireDesignerCatalogResult } from "@/lib/action-editor/catalog/designerCatalogRequest.server";
import { normalizeDesignerResourceQuery, readDesignerResourcePage, RESOURCE_PAGE_CAPABILITIES } from "@/lib/action-editor/catalog/designerResourcePage";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  return postDesignerCatalogRequest(req, async (body, request) => {
    if (!request.bound) throw new DesignerCatalogError("HOST_BINDING_REQUIRED", "A resolved document target is required for resource paging.");
    const query = normalizeDesignerResourceQuery(body);
    if (request.rpcOptions.hostBinding?.capabilities[RESOURCE_PAGE_CAPABILITIES[query.kind]] !== true)
      throw new DesignerCatalogError("UNSUPPORTED_HOST", "The bound host does not support this resource catalog.");
    const result = await runQkrpc([query.kind === "action" ? "action" : "subprogram", "catalog-page", "--scope", query.scope,
      "--query", query.query, "--skip", String(query.skip), "--take", String(query.take),
      ...(query.expectedSnapshotId ? ["--snapshot-id", query.expectedSnapshotId] : []), "--no-bootstrap"],
    { timeoutMs: 30_000, ...request.rpcOptions });
    requireDesignerCatalogResult(result, request);
    const root = result.parsed as { payload?: unknown } | undefined;
    const page = readDesignerResourcePage(root?.payload ?? result.parsed, query);
    request.rpcOptions.abortSignal?.throwIfAborted();
    return Response.json({ ok: true, ...page });
  });
}
