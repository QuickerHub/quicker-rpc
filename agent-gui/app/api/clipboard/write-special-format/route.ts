import { invokeQkrpcHttp } from "@/lib/qkrpc-http";

export const dynamic = "force-dynamic";

type WriteBody = {
  format?: string;
  text?: string;
};

export async function POST(req: Request) {
  let body: WriteBody;
  try {
    body = (await req.json()) as WriteBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const format = (body.format ?? "").trim();
  const text = body.text ?? "";
  if (!format) {
    return Response.json({ ok: false, error: "format is required" }, { status: 400 });
  }
  if (!text) {
    return Response.json({ ok: false, error: "text is required" }, { status: 400 });
  }

  const result = await invokeQkrpcHttp(
    {
      op: "clipboard.write-special-format",
      args: { format, text },
    },
    { timeoutMs: 15_000 },
  );

  if (!result?.ok) {
    return Response.json({ ok: false, stub: true });
  }

  return Response.json({ ok: true });
}
