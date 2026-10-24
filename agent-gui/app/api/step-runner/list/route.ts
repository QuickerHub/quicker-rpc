import { runQkrpc } from "@/lib/qkrpc";
import { mapSearchItemToStepRunnerItem } from "@/lib/action-editor/api/stepRunnerSchemaMap";
import { runDesignerCatalogRequest, postDesignerCatalogRequest, requireDesignerCatalogResult, type DesignerCatalogRequest } from "@/lib/action-editor/catalog/designerCatalogRequest.server";
import {
  listStaticStepRunnerSearchItems,
} from "@/lib/action-editor/data/stepRunnersUiCatalog.server";

export const dynamic = "force-dynamic";

function useLiveCatalog(): boolean {
  // Default: live Quicker catalog via qkrpc. Static JSON is opt-in for offline UI dev.
  return process.env.STEP_RUNNER_CATALOG_STATIC !== "1";
}

function unwrapPayload(data: unknown): Record<string, unknown> | null {
  if (typeof data !== "object" || data === null) return null;
  const root = data as Record<string, unknown>;
  if (typeof root.payload === "object" && root.payload !== null) {
    return root.payload as Record<string, unknown>;
  }
  return root;
}

async function list(limitValue: unknown, request: DesignerCatalogRequest) {
  if (!request.bound && !useLiveCatalog()) {
    return Response.json({ ok: true, items: listStaticStepRunnerSearchItems(), source: "static" });
  }

  const limit = Math.min(500, Math.max(1, Number(limitValue ?? "500")));

  const result = await runQkrpc(
    ["step-runner", "list", "--limit", String(limit), "--json"],
    { timeoutMs: 60_000, ...request.rpcOptions },
  );
  requireDesignerCatalogResult(result, request);

  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.stderr || "step-runner list failed" },
      { status: 503 },
    );
  }

  const payload = unwrapPayload(result.parsed);
  const itemsRaw = Array.isArray(payload?.items) ? payload!.items : [];
  const items = itemsRaw
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    .map(mapSearchItemToStepRunnerItem);

  return Response.json({ ok: true, items, source: "live" });
}

export async function GET(req: Request) {
  return runDesignerCatalogRequest(req, {}, (request) => list(new URL(req.url).searchParams.get("limit"), request));
}

export async function POST(req: Request) {
  return postDesignerCatalogRequest(req, (body, request) => list(body.limit, request));
}
