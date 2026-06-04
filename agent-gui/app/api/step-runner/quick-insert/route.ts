import { runQkrpc } from "@/lib/qkrpc";

export const dynamic = "force-dynamic";

function unwrapPayload(data: unknown): Record<string, unknown> | null {
  if (typeof data !== "object" || data === null) return null;
  const root = data as Record<string, unknown>;
  if (typeof root.payload === "object" && root.payload !== null) {
    return root.payload as Record<string, unknown>;
  }
  return root;
}

function readSearchControlValue(item: Record<string, unknown>): string | undefined {
  const nested = item.controlField ?? item.ControlField;
  if (typeof nested === "object" && nested !== null && !Array.isArray(nested)) {
    const row = nested as Record<string, unknown>;
    const value = row.value ?? row.Value;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const legacy = item.controlFieldValue ?? item.ControlFieldValue;
  return typeof legacy === "string" && legacy.trim() ? legacy.trim() : undefined;
}

function mapQuickInsertItems(items: Record<string, unknown>[]): unknown[] {
  return items.map((item) => ({
    kind: "runner",
    id: item.key ?? item.Key,
    label: item.name ?? item.Name ?? item.key ?? item.Key,
    description: item.description ?? item.Description ?? "",
    payload: {
      stepRunnerKey: item.key ?? item.Key,
      name: item.name ?? item.Name,
      icon: item.icon ?? item.Icon,
      controlFieldValue: readSearchControlValue(item),
    },
  }));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = url.searchParams.get("query")?.trim() ?? "";
  const limit = Math.min(40, Math.max(1, Number(url.searchParams.get("limit") ?? "20")));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0"));

  const result = await runQkrpc(
    ["step-runner", "search", "--query", query, "--limit", String(limit + offset), "--json"],
    { timeoutMs: 60_000 },
  );

  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.stderr || "step-runner search failed" },
      { status: 503 },
    );
  }

  const payload = unwrapPayload(result.parsed);
  const allItems = (Array.isArray(payload?.items) ? payload!.items : [])
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null);
  const page = allItems.slice(offset, offset + limit);
  const matchCount = typeof payload?.matchCount === "number" ? payload.matchCount : allItems.length;

  const json = JSON.stringify({
    items: mapQuickInsertItems(page),
    totalCount: matchCount,
    hasMore: offset + limit < matchCount,
  });

  return Response.json({ ok: true, json });
}
