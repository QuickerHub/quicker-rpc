import { runQkrpc } from "@/lib/qkrpc";

export const dynamic = "force-dynamic";

type FaVectorDto = {
  path: string;
  width: number;
  height: number;
  fill: string;
  icon?: string;
};

function unwrapPayload(data: unknown): Record<string, unknown> | null {
  if (typeof data !== "object" || data === null) return null;
  const root = data as Record<string, unknown>;
  if (typeof root.payload === "object" && root.payload !== null) {
    return root.payload as Record<string, unknown>;
  }
  return root;
}

function mapFirstItem(data: unknown): FaVectorDto | null {
  const payload = unwrapPayload(data);
  const items = Array.isArray(payload?.items) ? payload!.items : [];
  const raw = items[0];
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const path = typeof o.path === "string" ? o.path : "";
  if (!path) return null;
  const color = typeof o.color === "string" ? o.color.trim() : "";
  return {
    path,
    width: typeof o.width === "number" ? o.width : 512,
    height: typeof o.height === "number" ? o.height : 512,
    fill: color || "currentColor",
    icon: typeof o.enumName === "string" ? o.enumName : undefined,
  };
}

/** Designer-compatible FA vector endpoint backed by qkrpc fa resolve. */
export async function GET(req: Request) {
  const spec = new URL(req.url).searchParams.get("spec")?.trim() ?? "";
  if (!spec) {
    return Response.json({ error: "Missing spec" }, { status: 400 });
  }

  const result = await runQkrpc(
    ["fa", "resolve", "--spec", spec, "--json"],
    { timeoutMs: 30_000 },
  );

  if (!result.ok) {
    return Response.json({ error: "not_found" }, { status: 503 });
  }

  const dto = mapFirstItem(result.parsed);
  if (!dto) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  return Response.json(dto, {
    headers: { "Cache-Control": "public, no-cache" },
  });
}
