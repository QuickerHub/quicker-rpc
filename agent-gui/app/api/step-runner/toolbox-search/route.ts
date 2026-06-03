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
    },
  }));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = url.searchParams.get("query")?.trim() ?? "";

  const result = await runQkrpc(
    ["step-runner", "search", "--query", query, "--limit", "40", "--json"],
    { timeoutMs: 60_000 },
  );

  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.stderr || "step-runner search failed" },
      { status: 503 },
    );
  }

  const payload = unwrapPayload(result.parsed);
  const items = (Array.isArray(payload?.items) ? payload!.items : [])
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null);

  const json = JSON.stringify({ items: mapQuickInsertItems(items) });
  return Response.json({ ok: true, json });
}
