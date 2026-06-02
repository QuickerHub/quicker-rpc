import { runQkrpc } from "@/lib/qkrpc";

export const dynamic = "force-dynamic";

type CommandBody = {
  op?: string;
  id?: string;
  param?: string;
  debug?: boolean;
  wait?: boolean;
};

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
  return "qkrpc 命令失败";
}

export async function POST(req: Request) {
  const body = (await req.json()) as CommandBody;
  const op = body.op?.trim();
  const id = body.id?.trim();
  if (!op || !id) {
    return Response.json({ ok: false, error: "缺少 op 或 id" }, { status: 400 });
  }

  if (op === "run") {
    const args = ["action", "run", "--id", id, "--json"];
    if (body.param?.trim()) args.push("--param", body.param.trim());
    if (body.debug) args.push("--debug");
    if (body.wait) args.push("--wait");
    const result = await runQkrpc(args, { timeoutMs: body.wait ? 300_000 : 120_000 });
    if (!result.ok) {
      return Response.json(
        { ok: false, error: formatError(result), data: result.parsed },
        { status: 502 },
      );
    }
    return Response.json({ ok: true, data: result.parsed });
  }

  if (op === "edit") {
    const result = await runQkrpc(["action", "edit", "--id", id, "--json"], {
      timeoutMs: 30_000,
    });
    if (!result.ok) {
      return Response.json(
        { ok: false, error: formatError(result), data: result.parsed },
        { status: 502 },
      );
    }
    return Response.json({ ok: true, data: result.parsed });
  }

  return Response.json({ ok: false, error: `未知 op: ${op}` }, { status: 400 });
}
