import { invokeQkrpcHttp } from "@/lib/qkrpc-http";

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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = url.searchParams.get("query")?.trim() ?? "";
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? "200")));

  const result = await invokeQkrpcHttp(
    {
      op: "subprogram.list",
      args: { query: query || undefined, limit },
    },
    { timeoutMs: 60_000 },
  );

  if (!result?.ok) {
    return Response.json(
      { ok: false, error: result?.stderr || "subprogram list failed" },
      { status: 503 },
    );
  }

  return Response.json({ ok: true, items: unwrapItems(result.parsed) });
}
