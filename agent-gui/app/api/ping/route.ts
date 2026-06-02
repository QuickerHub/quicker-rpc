import { formatQkrpcResult, runQkrpc } from "@/lib/qkrpc";
import { fetchQkrpcHealth } from "@/lib/qkrpc-http";

export const dynamic = "force-dynamic";

export async function GET() {
  // Prefer live serve health (ignore stale transport probe cache).
  const health = await fetchQkrpcHealth({ timeoutMs: 8_000 });
  if (health?.ok) {
    return Response.json(formatQkrpcResult(health), { status: 200 });
  }

  const result = await runQkrpc(["ping", "--timeout", "8"], {
    timeoutMs: 12_000,
  });
  const body = formatQkrpcResult(result);
  return Response.json(body, { status: result.ok ? 200 : 503 });
}
