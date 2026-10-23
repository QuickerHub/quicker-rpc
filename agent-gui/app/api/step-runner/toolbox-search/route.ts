import { invokeQkrpcHttp } from "@/lib/qkrpc-http";
import { postDesignerCatalogRequest, requireDesignerCatalogResult, type DesignerCatalogRequest } from "@/lib/action-editor/catalog/designerCatalogRequest.server";

export const dynamic = "force-dynamic";

type ToolboxSearchRequest = {
  keyword?: string;
  skip?: number;
};

function unwrapPayloadJson(data: unknown): string | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const root = data as Record<string, unknown>;
  const payload =
    typeof root.payload === "object" && root.payload !== null
      ? (root.payload as Record<string, unknown>)
      : root;
  const json = payload.json;
  return typeof json === "string" ? json : null;
}

export async function POST(req: Request) {
  return postDesignerCatalogRequest(req, (body, request) => search(body as ToolboxSearchRequest, request));
}

async function search(body: ToolboxSearchRequest, request: DesignerCatalogRequest) {

  const result = await invokeQkrpcHttp(
    {
      op: "step-runner.toolboxsearch",
      args: {
        keyword: (body.keyword ?? "").trim(),
        skip: Math.max(0, Number(body.skip ?? 0)),
      },
    },
    { timeoutMs: 60_000, ...request.rpcOptions },
  );
  requireDesignerCatalogResult(result, request);

  if (!result?.ok) {
    return Response.json(
      { ok: false, error: result?.stderr || "step-runner toolbox search failed" },
      { status: 503 },
    );
  }

  const json = unwrapPayloadJson(result.parsed);
  if (!json) {
    return Response.json(
      { ok: false, error: "step-runner toolbox search: missing payload.json" },
      { status: 503 },
    );
  }

  return Response.json({ ok: true, json });
}
