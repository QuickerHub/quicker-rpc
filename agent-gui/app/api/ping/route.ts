import { formatQkrpcResult, runQkrpc } from "@/lib/qkrpc";
import { fetchQkrpcHealth } from "@/lib/qkrpc-http";
import { shouldUseHttpTransport } from "@/lib/qkrpc-transport";

export const dynamic = "force-dynamic";

export async function GET() {
  if (await shouldUseHttpTransport()) {
    const health = await fetchQkrpcHealth({ timeoutMs: 8_000 });
    if (health?.ok) {
      const body = formatQkrpcResult(health);
      return Response.json(body, { status: 200 });
    }
  }

  const result = await runQkrpc(["ping", "--timeout", "8"], {
    timeoutMs: 12_000,
  });
  const body = formatQkrpcResult(result);
  return Response.json(body, { status: result.ok ? 200 : 503 });
}
