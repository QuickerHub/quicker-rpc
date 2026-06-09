import { runQkrpc } from "@/lib/qkrpc";
import { mapAgentSchemaToStepRunnerItem } from "@/lib/action-editor/api/stepRunnerSchemaMap";
import {
  getStaticStepRunnerItem,
  hasStaticStepRunnersUiCatalog,
} from "@/lib/action-editor/data/stepRunnersUiCatalog.server";
import { resolveStepRunnerKeyCandidates } from "@/lib/action-editor/steps/stepRunnerKeyResolve";

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

async function fetchLiveStepRunnerItem(
  key: string,
  controlField?: string,
): Promise<Record<string, unknown> | null> {
  const args = ["step-runner", "get-ui", "--key", key, "--json"];
  if (controlField) {
    args.push("--control-field", controlField);
  }

  const result = await runQkrpc(args, { timeoutMs: 60_000 });
  if (!result.ok) {
    return null;
  }

  const schema = unwrapSchema(result.parsed);
  if (!schema) {
    return null;
  }

  return mapAgentSchemaToStepRunnerItem(schema) as unknown as Record<string, unknown>;
}

function fetchStaticStepRunnerItem(
  key: string,
  controlField?: string,
): Record<string, unknown> | null {
  const item = getStaticStepRunnerItem(key, controlField);
  if (!item) {
    return null;
  }
  return item as unknown as Record<string, unknown>;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key")?.trim() ?? "";
  const controlField = url.searchParams.get("controlField")?.trim();

  if (!key) {
    return Response.json({ ok: false, error: "key is required" }, { status: 400 });
  }

  if (!useLiveCatalog()) {
    const item = fetchStaticStepRunnerItem(key, controlField);
    if (item) {
      return Response.json({ ok: true, item, source: "static" });
    }
    return Response.json(
      { ok: false, error: `Step runner not in static catalog: ${key}` },
      { status: 404 },
    );
  }

  const keysToTry = resolveStepRunnerKeyCandidates(key);
  for (const tryKey of keysToTry) {
    const liveItem = await fetchLiveStepRunnerItem(tryKey, controlField);
    if (liveItem) {
      return Response.json({ ok: true, item: liveItem, source: "live" });
    }
  }

  if (hasStaticStepRunnersUiCatalog()) {
    for (const tryKey of keysToTry) {
      const staticItem = fetchStaticStepRunnerItem(tryKey, controlField);
      if (staticItem) {
        return Response.json({ ok: true, item: staticItem, source: "static-fallback" });
      }
    }
  }

  return Response.json(
    {
      ok: false,
      error: `step-runner get-ui failed for ${key} (tried: ${keysToTry.join(", ")}). Is Quicker running with QuickerRpc plugin?`,
    },
    { status: 503 },
  );
}
