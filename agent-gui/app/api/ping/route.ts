import { formatQkrpcResult, runQkrpc } from "@/lib/qkrpc";
import { fetchQkrpcHealth, resolveQkrpcHttpBase } from "@/lib/qkrpc-http";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await fetchQkrpcHealth({ timeoutMs: 8_000 });
  if (health?.ok) {
    return Response.json(formatQkrpcResult(health), { status: 200 });
  }

  const result = await runQkrpc(["ping", "--timeout", "8"], {
    timeoutMs: 12_000,
  });
  const body = formatQkrpcResult(result);
  if (!result.ok && !String(result.stderr ?? "").trim()) {
    return Response.json(
      {
        ...body,
        stderr: `无法连接 qkrpc serve（${resolveQkrpcHttpBase()}）。请确认 Quicker 已运行且 serve 已启动。`,
      },
      { status: 503 },
    );
  }
  return Response.json(body, { status: result.ok ? 200 : 503 });
}
