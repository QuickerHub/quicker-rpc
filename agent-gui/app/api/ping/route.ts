import { formatQkrpcResult, runQkrpc } from "@/lib/qkrpc";
import { fetchQkrpcHealth, resolveQkrpcHttpBase } from "@/lib/qkrpc-http";
import { invalidateServeProbeCache } from "@/lib/qkrpc-transport";

export const dynamic = "force-dynamic";

const FAST_HEALTH_MS = 1_200;
const FULL_HEALTH_MS = 3_000;
const FAST_CLI_TIMEOUT_SEC = 3;
const FULL_CLI_TIMEOUT_SEC = 6;

function parseFastMode(req: Request): boolean {
  const raw = new URL(req.url).searchParams.get("fast");
  return raw !== "0" && raw !== "false";
}

export async function GET(req: Request) {
  const fast = parseFastMode(req);
  invalidateServeProbeCache();

  const health = await fetchQkrpcHealth({
    timeoutMs: fast ? FAST_HEALTH_MS : FULL_HEALTH_MS,
  });

  if (health !== null) {
    return Response.json(formatQkrpcResult(health), {
      status: health.ok ? 200 : 503,
    });
  }

  if (fast) {
    return Response.json(
      {
        ok: false,
        stderr: `无法连接 qkrpc serve（${resolveQkrpcHttpBase()}）。请确认已运行 pwsh ./build.ps1 -t 或 qkrpc serve 已启动。`,
      },
      { status: 503 },
    );
  }

  const result = await runQkrpc(
    ["ping", "--timeout", String(FULL_CLI_TIMEOUT_SEC)],
    { timeoutMs: (FULL_CLI_TIMEOUT_SEC + 2) * 1_000 },
  );
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
