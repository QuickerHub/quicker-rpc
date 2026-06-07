import { resolveQkrpcHttpBase } from "@/lib/qkrpc-http";

export const runtime = "nodejs";

const TRACE_TIMEOUT_SECONDS = 300;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const actionId = url.searchParams.get("id")?.trim();
  if (!actionId) {
    return Response.json({ ok: false, error: "缺少 id" }, { status: 400 });
  }

  const param = url.searchParams.get("param")?.trim() || undefined;
  const base = resolveQkrpcHttpBase();

  let upstream: Response;
  try {
    upstream = await fetch(`${base}/v1/action/trace/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        id: actionId,
        param,
        timeoutSeconds: TRACE_TIMEOUT_SECONDS,
      }),
      cache: "no-store",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { ok: false, error: `无法连接 qkrpc serve：${message}` },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return new Response(text || "trace stream failed", {
      status: upstream.status || 502,
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
