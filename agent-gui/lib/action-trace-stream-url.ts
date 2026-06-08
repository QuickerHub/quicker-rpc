import type { InlineXActionProgram } from "@/lib/action-trace-inline-programs";

const DEFAULT_SERVE_BASE = "http://127.0.0.1:9477";

export function resolveActionTraceServeBase(): string {
  return (
    process.env.NEXT_PUBLIC_QKRPC_HTTP_URL?.trim()
    || DEFAULT_SERVE_BASE
  ).replace(/\/$/, "");
}

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

  return `${resolveActionTraceServeBase()}/v1/action/trace/stream?${query.toString()}`;
}

export function resolveActionTraceStreamPost(
  options: {
    ephemeralId: string;
    xaction: InlineXActionProgram;
    param?: string;
  },
): { url: string; body: string } {
  const payload: Record<string, unknown> = {
    id: options.ephemeralId.trim(),
    xaction: {
      title: options.xaction.title,
      steps: options.xaction.steps,
      variables: options.xaction.variables,
    },
    timeoutSeconds: 300,
  };
  if (options.param?.trim()) {
    payload.param = options.param.trim();
  }

  return {
    url: `${resolveActionTraceServeBase()}/v1/action/trace/stream`,
    body: JSON.stringify(payload),
  };
}
