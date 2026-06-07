const DEFAULT_SERVE_BASE = "http://127.0.0.1:9477";

/** Browser connects directly to qkrpc serve (GET SSE) to avoid Next.js response buffering. */
export function resolveActionTraceStreamUrl(
  actionId: string,
  param?: string,
): string {
  const query = new URLSearchParams({
    id: actionId,
    timeoutSeconds: "300",
  });
  if (param?.trim()) {
    query.set("param", param.trim());
  }

  const serveBase = (
    process.env.NEXT_PUBLIC_QKRPC_HTTP_URL?.trim()
    || DEFAULT_SERVE_BASE
  ).replace(/\/$/, "");

  return `${serveBase}/v1/action/trace/stream?${query.toString()}`;
}
