import {
  isActionMetadataId,
  parseActionMetadataFromGetJson,
} from "@/lib/action-metadata-api";
import { runQkrpc } from "@/lib/qkrpc";

export const dynamic = "force-dynamic";

function formatError(result: {
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
  return "qkrpc action get failed";
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id")?.trim() ?? "";
  if (!isActionMetadataId(id)) {
    return Response.json({ ok: false, error: "无效的 action id" }, { status: 400 });
  }

  const result = await runQkrpc(
    ["action", "get", "--id", id, "--return-mode", "metadata"],
    { timeoutMs: 20_000 },
  );

  if (!result.ok || result.parsed === null) {
    return Response.json(
      { ok: false, error: formatError(result) },
      { status: 503 },
    );
  }

  const meta = parseActionMetadataFromGetJson(id, result.parsed);
  if (!meta) {
    return Response.json(
      { ok: false, error: "无法解析动作元数据" },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, meta });
}
