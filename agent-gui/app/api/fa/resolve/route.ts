import { runQkrpc } from "@/lib/qkrpc";
import type { FaIconGeometry } from "@/lib/fa-icon";

export const dynamic = "force-dynamic";

type ResolveResponse = {
  ok: boolean;
  items: FaIconGeometry[];
  errors: string[];
};

function mapItems(data: unknown): FaIconGeometry[] {
  if (typeof data !== "object" || data === null) return [];
  const root = data as Record<string, unknown>;
  const payload =
    typeof root.payload === "object" && root.payload !== null
      ? (root.payload as Record<string, unknown>)
      : root;
  const items = Array.isArray(payload.items) ? payload.items : [];
  const mapped: FaIconGeometry[] = [];
  for (const raw of items) {
    if (typeof raw !== "object" || raw === null) continue;
    const o = raw as Record<string, unknown>;
    const path = typeof o.path === "string" ? o.path : "";
    if (!path) continue;
    mapped.push({
      spec: String(o.spec ?? ""),
      enumName: String(o.enumName ?? ""),
      path,
      width: typeof o.width === "number" ? o.width : 512,
      height: typeof o.height === "number" ? o.height : 512,
      color: typeof o.color === "string" ? o.color : undefined,
      label: typeof o.label === "string" ? o.label : undefined,
      unicode: typeof o.unicode === "number" ? o.unicode : undefined,
    });
  }
  return mapped;
}

export async function POST(req: Request) {
  let specs: string[] = [];
  try {
    const body = (await req.json()) as { specs?: unknown };
    if (Array.isArray(body.specs)) {
      specs = body.specs
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  } catch {
    return Response.json({ ok: false, items: [], errors: ["Invalid JSON body"] }, {
      status: 400,
    });
  }

  if (specs.length === 0) {
    return Response.json({ ok: true, items: [], errors: [] } satisfies ResolveResponse);
  }

  const result = await runQkrpc(
    ["fa", "resolve", "--specs", JSON.stringify(specs)],
    { timeoutMs: 30_000 },
  );

  if (!result.ok) {
    return Response.json(
      {
        ok: false,
        items: [],
        errors: [result.stderr || "qkrpc fa resolve failed"],
      } satisfies ResolveResponse,
      { status: 503 },
    );
  }

  const data = result.parsed;
  const root =
    typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  const items = mapItems(root);
  const errors: string[] = [];
  if (Array.isArray(root.errors)) {
    for (const e of root.errors) {
      if (typeof e === "string") errors.push(e);
    }
  }

  return Response.json({ ok: true, items, errors } satisfies ResolveResponse);
}
