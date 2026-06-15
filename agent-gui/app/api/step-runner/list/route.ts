import { runQkrpc } from "@/lib/qkrpc";
import { mapSearchItemToStepRunnerItem } from "@/lib/action-editor/api/stepRunnerSchemaMap";
import {
  hasStaticStepRunnersUiCatalog,
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

export async function GET(req: Request) {
  if (!useLiveCatalog()) {
    return Response.json({ ok: true, items: listStaticStepRunnerSearchItems(), source: "static" });
  }

  const url = new URL(req.url);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? "500")));

  const result = await runQkrpc(
    ["step-runner", "list", "--limit", String(limit), "--json"],
    { timeoutMs: 60_000 },
  );

  if (!result.ok) {
    if (hasStaticStepRunnersUiCatalog()) {
      return Response.json({
        ok: true,
        items: listStaticStepRunnerSearchItems(),
        source: "static-fallback",
      });
    }
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
