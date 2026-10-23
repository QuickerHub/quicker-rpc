import { invokeQkrpcHttp } from "@/lib/qkrpc-http";
import { postDesignerCatalogRequest, requireDesignerCatalogResult, type DesignerCatalogRequest } from "@/lib/action-editor/catalog/designerCatalogRequest.server";

export const dynamic = "force-dynamic";

type QuickInsertSubProgramInput = {
  id?: string;
  name?: string;
  description?: string;
  identifier?: string;
};

type QuickInsertRequest = {
  keyword?: string;
  skip?: number;
  subPrograms?: QuickInsertSubProgramInput[];
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
  return postDesignerCatalogRequest(req, (body, request) => search(body as QuickInsertRequest, request));
}

async function search(body: QuickInsertRequest, request: DesignerCatalogRequest) {

  const subPrograms = (body.subPrograms ?? [])
    .map((sp) => ({
      id: (sp.id ?? "").trim(),
      name: (sp.name ?? "").trim(),
      description: (sp.description ?? "").trim(),
      identifier: (sp.identifier ?? "").trim(),
    }))
    .filter((sp) => sp.identifier.length > 0);

  const result = await invokeQkrpcHttp(
    {
      op: "step-runner.quickinsertsearch",
      args: {
        keyword: (body.keyword ?? "").trim(),
        skip: Math.max(0, Number(body.skip ?? 0)),
        subPrograms: subPrograms.length > 0 ? subPrograms : undefined,
      },
    },
    { timeoutMs: 60_000, ...request.rpcOptions },
  );
  requireDesignerCatalogResult(result, request);

  if (!result?.ok) {
    return Response.json(
      { ok: false, error: result?.stderr || "step-runner quick-insert search failed" },
      { status: 503 },
    );
  }

  const json = unwrapPayloadJson(result.parsed);
  if (!json) {
    return Response.json(
      { ok: false, error: "step-runner quick-insert search: missing payload.json" },
      { status: 503 },
    );
  }

  return Response.json({ ok: true, json });
}
