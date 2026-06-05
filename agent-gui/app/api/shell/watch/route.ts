import {
  getShellSession,
  subscribeShellSession,
  type ShellSessionSnapshot,
} from "@/lib/shell-session-registry.server";

export const runtime = "nodejs";

function encodeSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId")?.trim();
  if (!sessionId) {
    return Response.json({ error: "sessionId is required" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (snapshot: ShellSessionSnapshot) => {
        if (closed) return;
        controller.enqueue(encoder.encode(encodeSse("snapshot", snapshot)));
        if (snapshot.status !== "running") {
          closed = true;
          unsubscribe?.();
          controller.close();
        }
      };

      const existing = getShellSession(sessionId);
      if (existing) push(existing);

      unsubscribe = subscribeShellSession(sessionId, push);

      const heartbeat = setInterval(() => {
        if (closed) {
          clearInterval(heartbeat);
          return;
        }
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 15_000);

      const onAbort = () => {
        closed = true;
        clearInterval(heartbeat);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", onAbort);
    },
    cancel() {
      closed = true;
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
