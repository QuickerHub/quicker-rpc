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

function readSearchControlValues(
  item: Record<string, unknown>,
): string[] {
  const multi = item.controlFields ?? item.ControlFields;
  if (Array.isArray(multi) && multi.length > 0) {
    const values: string[] = [];
    for (const row of multi) {
      if (typeof row !== "object" || row === null || Array.isArray(row)) {
        continue;
      }
      const r = row as Record<string, unknown>;
      const value = r.value ?? r.Value;
      if (typeof value === "string" && value.trim()) {
        values.push(value.trim());
      }
    }
    if (values.length > 0) {
      return values;
    }
  }
  const single = readSearchControlValue(item);
  return single ? [single] : [];
}

function mapQuickInsertItems(items: Record<string, unknown>[]): unknown[] {
  const out: unknown[] = [];
  for (const item of items) {
    const key = item.key ?? item.Key;
    const name = item.name ?? item.Name ?? key;
    const controls = readSearchControlValues(item);
    if (controls.length === 0) {
      out.push({
        kind: "runner",
        id: key,
        label: name,
        description: item.description ?? item.Description ?? "",
        payload: {
          stepRunnerKey: key,
          name,
          icon: item.icon ?? item.Icon,
        },
      });
      continue;
    }
    for (const controlFieldValue of controls) {
      out.push({
        kind: "runner",
        id: `${String(key)}\0${controlFieldValue}`,
        label: controls.length > 1 ? `${name} · ${controlFieldValue}` : name,
        description: item.description ?? item.Description ?? "",
        payload: {
          stepRunnerKey: key,
          name,
          icon: item.icon ?? item.Icon,
          controlFieldValue,
        },
      });
    }
  }
  return out;
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
