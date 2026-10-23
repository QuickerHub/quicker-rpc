import { invokeQkrpcHttp } from "@/lib/qkrpc-http";
import { runDesignerCatalogRequest, postDesignerCatalogRequest, requireDesignerCatalogResult, type DesignerCatalogRequest } from "@/lib/action-editor/catalog/designerCatalogRequest.server";

export const dynamic = "force-dynamic";

function unwrapItems(data: unknown): unknown[] {
  if (typeof data !== "object" || data === null) return [];
  const root = data as Record<string, unknown>;
  const payload =
    typeof root.payload === "object" && root.payload !== null
      ? (root.payload as Record<string, unknown>)
      : root;
  const items = payload.items ?? payload.Items;
  return Array.isArray(items) ? items : [];
}

async function list(query: string, limitValue: unknown, request: DesignerCatalogRequest) {
  const limit = Math.min(200, Math.max(1, Number(limitValue ?? "200")));

  const result = await invokeQkrpcHttp(
    {
      op: "subprogram.list",
      args: { query: query || undefined, limit },
    },
    { timeoutMs: 60_000, ...request.rpcOptions },
  );
  requireDesignerCatalogResult(result, request);

  if (!result?.ok) {
    return Response.json(
      { ok: false, error: result?.stderr || "subprogram list failed" },
      { status: 503 },
    );
  }

  return Response.json({ ok: true, items: unwrapItems(result.parsed) });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  return runDesignerCatalogRequest(req, {}, (request) => list(url.searchParams.get("query")?.trim() ?? "", url.searchParams.get("limit"), request));
}

export async function POST(req: Request) {
  return postDesignerCatalogRequest(req, (body, request) => list(typeof body.query === "string" ? body.query.trim() : "", body.limit, request));
}
