import { subscribeActionExplorerWatch } from "@/lib/action-explorer-watch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_MS = 25_000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cwd = url.searchParams.get("cwd")?.trim() ?? "";

  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const sendRaw = (chunk: string) => {
        if (closed) return;
        controller.enqueue(encoder.encode(chunk));
      };

      const sendEvent = (payload: unknown) => {
        sendRaw(`data: ${JSON.stringify(payload)}\n\n`);
      };

      heartbeat = setInterval(() => {
        sendRaw(": heartbeat\n\n");
      }, HEARTBEAT_MS);

      unsubscribe = subscribeActionExplorerWatch(cwd, (event) => {
        sendEvent(event);
      });

      req.signal.addEventListener("abort", () => {
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
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
