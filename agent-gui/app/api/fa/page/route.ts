import { runQkrpc } from "@/lib/qkrpc";
import { DesignerCatalogError } from "@/lib/action-editor/catalog/designerCatalogContext";
import { postDesignerCatalogRequest, requireDesignerCatalogResult } from "@/lib/action-editor/catalog/designerCatalogRequest.server";
import { normalizeDesignerFaPageQuery, readDesignerFaPage } from "@/lib/action-editor/catalog/designerFaPage";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return postDesignerCatalogRequest(req, async (body, request) => {
    if (!request.bound) throw new DesignerCatalogError("HOST_BINDING_REQUIRED", "A resolved document target is required for icon paging.");
    const query = normalizeDesignerFaPageQuery(body);
    const result = await runQkrpc(["fa", "page", "--query", query.query, "--style", query.style ?? "", "--skip", String(query.skip), "--take", String(query.take)],
      { timeoutMs: 30_000, ...request.rpcOptions });
    requireDesignerCatalogResult(result, request);
    request.rpcOptions.abortSignal?.throwIfAborted();
    const root = result.parsed as { payload?: unknown } | undefined;
    const page = readDesignerFaPage(root?.payload ?? result.parsed, query);
    request.rpcOptions.abortSignal?.throwIfAborted();
    return Response.json({ ok: true, ...page });
  });
}
