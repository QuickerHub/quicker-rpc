import { parseActionMentionItemsFromQkrpcJson } from "@/lib/action-mention-items";
import { runQkrpc } from "@/lib/qkrpc";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

function clampLimit(raw: string | null): number {
  const n = Number.parseInt(raw ?? String(DEFAULT_LIMIT), 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function unwrapPayload(parsed: unknown): unknown {
  if (typeof parsed !== "object" || parsed === null) return null;
  const root = parsed as Record<string, unknown>;
  if (typeof root.payload === "object" && root.payload !== null) {
    return root.payload;
  }
  if (typeof root.data === "object" && root.data !== null) {
    const data = root.data as Record<string, unknown>;
    if (typeof data.payload === "object" && data.payload !== null) {
      return data.payload;
    }
    return data;
  }
  return root;
}

function formatSearchError(result: {
  stderr: string;
  parsed: unknown;
}): string {
  const stderr = result.stderr.trim();
  if (stderr) return stderr;
  if (typeof result.parsed === "object" && result.parsed !== null) {
    const o = result.parsed as Record<string, unknown>;
    const msg = o.message ?? o.errorMessage ?? o.error;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return "qkrpc action list failed";
}

function buildListArgv(query: string, limit: number): string[] {
  const argv = ["action", "list", "--limit", String(query ? limit : Math.max(limit, 50))];
  if (query) {
    argv.push("--query", query);
  } else {
    argv.push("--sort", "lastEdit");
  }
  return argv;
}

/** Search or list recent actions (agent query / list UI — not composer @-mentions). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const limit = clampLimit(url.searchParams.get("limit"));

  const result = await runQkrpc(buildListArgv(query, limit), { timeoutMs: 20_000 });
  if (!result.ok || result.parsed === null) {
    return Response.json(
      { ok: false, error: formatSearchError(result), items: [] },
      { status: 503 },
    );
  }

  const payload = unwrapPayload(result.parsed);
  if (
    typeof payload === "object"
    && payload !== null
    && "success" in payload
    && (payload as { success?: boolean }).success === false
  ) {
    const msg = (payload as { errorMessage?: string }).errorMessage?.trim();
    return Response.json(
      { ok: false, error: msg || "action list failed", items: [] },
      { status: 503 },
    );
  }

  const items = parseActionMentionItemsFromQkrpcJson(result.parsed, limit);
  return Response.json({
    ok: true,
    source: query ? "search" : "recent",
    ...(query ? { query } : {}),
    items,
  });
}
