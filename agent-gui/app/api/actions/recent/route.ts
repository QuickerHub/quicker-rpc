import { parseRecentActionsFromQkrpcJson } from "@/lib/recent-actions";
import { runQkrpc } from "@/lib/qkrpc";

export const dynamic = "force-dynamic";

function unwrapListPayload(parsed: unknown): unknown {
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

function formatListError(result: {
  stderr: string;
  parsed: unknown;
}): string {
  const stderr = result.stderr.trim();
  if (
    stderr.includes("SearchActionSummariesAsync")
    && (stderr.includes("4") || stderr.includes("参数"))
  ) {
    return "QuickerRpc 插件版本过旧：请在 Quicker 中重新加载插件（build.ps1 -t 后执行 QuickerRpc_Run）";
  }
  if (stderr) return stderr;
  if (typeof result.parsed === "object" && result.parsed !== null) {
    const o = result.parsed as Record<string, unknown>;
    const msg = o.message ?? o.errorMessage;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return "qkrpc action list failed";
}

/** Recently edited actions (library-wide, sorted by last edit). */
export async function GET() {
  // Fetch a wider window so client-side sort still works if an older plugin
  // returns only enumeration-order matches before sorting.
  const result = await runQkrpc(
    ["action", "list", "--limit", "50", "--sort", "lastEdit"],
    {
      timeoutMs: 20_000,
    },
  );

  if (!result.ok || result.parsed === null) {
    return Response.json(
      {
        ok: false,
        error: formatListError(result),
        items: [],
      },
      { status: 503 },
    );
  }

  const items = parseRecentActionsFromQkrpcJson(result.parsed, 12);
  const payload = unwrapListPayload(result.parsed);
  const sortApplied =
    typeof payload === "object"
    && payload !== null
    && "sort" in payload
    && (payload as { sort?: string }).sort === "lastEdit";
  return Response.json({ ok: true, items, sortApplied });
}
