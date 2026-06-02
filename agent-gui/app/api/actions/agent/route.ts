import { parseRecentActionsFromQkrpcJson } from "@/lib/recent-actions";
import { runQkrpc } from "@/lib/qkrpc";

export const dynamic = "force-dynamic";

const AGENT_LIST_LIMIT = 50;

function formatListError(result: {
  stderr: string;
  parsed: unknown;
}): string {
  const stderr = result.stderr.trim();
  if (stderr) return stderr;
  if (typeof result.parsed === "object" && result.parsed !== null) {
    const o = result.parsed as Record<string, unknown>;
    const msg = o.message ?? o.errorMessage;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return "列出助手动作失败";
}

/** Actions on the assistant virtual page (scope=agent). */
export async function GET() {
  const result = await runQkrpc(
    [
      "action",
      "list",
      "--scope",
      "agent",
      "--limit",
      String(AGENT_LIST_LIMIT),
      "--sort",
      "lastEdit",
    ],
    { timeoutMs: 20_000 },
  );

  if (!result.ok || result.parsed === null) {
    return Response.json(
      { ok: false, error: formatListError(result), items: [] },
      { status: 503 },
    );
  }

  const items = parseRecentActionsFromQkrpcJson(result.parsed, AGENT_LIST_LIMIT);
  return Response.json({ ok: true, items });
}
