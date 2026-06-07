import { runQkrpc } from "@/lib/qkrpc";
import { mapAgentSchemaToStepRunnerItem } from "@/lib/action-editor/api/stepRunnerSchemaMap";
import {
  getStaticStepRunnerItem,
} from "@/lib/action-editor/data/stepRunnersUiCatalog.server";

export const dynamic = "force-dynamic";

function useLiveCatalog(): boolean {
  // Default: live Quicker catalog via qkrpc. Static JSON is opt-in for offline UI dev.
  return process.env.STEP_RUNNER_CATALOG_STATIC !== "1";
}

function unwrapSchema(data: unknown): Record<string, unknown> | null {
  if (typeof data !== "object" || data === null) return null;
  const root = data as Record<string, unknown>;
  const payload =
    typeof root.payload === "object" && root.payload !== null
      ? (root.payload as Record<string, unknown>)
      : root;

  const schema = payload.schema ?? payload.Schema;
  if (typeof schema === "object" && schema !== null && !Array.isArray(schema)) {
    return schema as Record<string, unknown>;
  }

  const schemaJson = payload.schemaJson ?? payload.SchemaJson;
  if (typeof schemaJson === "string" && schemaJson.trim()) {
    try {
      return JSON.parse(schemaJson) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key")?.trim() ?? "";
  const controlField = url.searchParams.get("controlField")?.trim();

  if (!key) {
    return Response.json({ ok: false, error: "key is required" }, { status: 400 });
  }

  if (!useLiveCatalog()) {
    const item = getStaticStepRunnerItem(key, controlField);
    if (item) {
      return Response.json({ ok: true, item, source: "static" });
    }
    return Response.json(
      { ok: false, error: `Step runner not in static catalog: ${key}` },
      { status: 404 },
    );
  }

  const args = ["step-runner", "get-ui", "--key", key, "--json"];
  if (controlField) {
    args.push("--control-field", controlField);
  }

  const result = await runQkrpc(args, { timeoutMs: 60_000 });
  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.stderr || "step-runner get-ui failed" },
      { status: 503 },
    );
  }

  const schema = unwrapSchema(result.parsed);
  if (!schema) {
    return Response.json({ ok: false, error: "Missing schema in response" }, { status: 502 });
  }

  return Response.json({
    ok: true,
    item: mapAgentSchemaToStepRunnerItem(schema),
    source: "live",
  });
}
