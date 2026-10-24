import {
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
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let onAbort: (() => void) | null = null;
  let closed = false;

  const release = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    unsubscribe?.();
    unsubscribe = null;
    if (onAbort) req.signal.removeEventListener("abort", onAbort);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return;
        release();
        controller.close();
      };
      onAbort = close;
      req.signal.addEventListener("abort", onAbort, { once: true });
      if (req.signal.aborted) { close(); return; }

      const push = (snapshot: ShellSessionSnapshot) => {
        if (closed) return;
        controller.enqueue(encoder.encode(encodeSse("snapshot", snapshot)));
        if (snapshot.status !== "running") {
          close();
        }
      };

      // The registry replays synchronously; a terminal snapshot can close before it returns.
      const stopSubscription = subscribeShellSession(sessionId, push);
      if (closed) { stopSubscription(); return; }
      unsubscribe = stopSubscription;
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 15_000);
    },
    cancel() {
      release();
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
