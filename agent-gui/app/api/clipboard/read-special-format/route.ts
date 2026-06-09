import { invokeQkrpcHttp } from "@/lib/qkrpc-http";

export const dynamic = "force-dynamic";

function unwrapClipboardRead(data: unknown): { hasData: boolean; text: string } | null {
  if (typeof data !== "object" || data === null) return null;
  const root = data as Record<string, unknown>;
  const payload =
    typeof root.payload === "object" && root.payload !== null
      ? (root.payload as Record<string, unknown>)
      : root;
  const hasData = Boolean(payload.hasData ?? payload.HasData);
  const text = typeof payload.text === "string" ? payload.text : typeof payload.Text === "string" ? payload.Text : "";
  return { hasData, text };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format")?.trim() ?? "";
  if (!format) {
    return Response.json({ hasData: false, error: "format is required" }, { status: 400 });
  }

  const result = await invokeQkrpcHttp(
    {
      op: "clipboard.read-special-format",
      args: { format },
    },
    { timeoutMs: 15_000 },
  );

  if (!result?.ok) {
    return Response.json({ hasData: false, stub: true });
  }

  const parsed = unwrapClipboardRead(result.parsed);
  if (!parsed) {
    return Response.json({ hasData: false, stub: true });
  }

  return Response.json({ hasData: parsed.hasData, text: parsed.text });
}
