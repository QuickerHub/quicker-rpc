import {
  subscribeTraceBridge,
  type TraceBridgeMessage,
} from "@/lib/action-trace-bridge.server";

export const runtime = "nodejs";

function encodeSse(eventName: string, data: unknown): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(
    `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

/** Browser subscribes while Agent trace tool runs on the server (single execution). */
export async function GET(req: Request) {
  const tabId = new URL(req.url).searchParams.get("tabId")?.trim();
  if (!tabId) {
    return Response.json({ ok: false, error: "missing tabId" }, { status: 400 });
  }

  let unsubscribe: (() => void) | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (message: TraceBridgeMessage) => {
        if (closed) return;
        switch (message.type) {
          case "trace":
            controller.enqueue(encodeSse("trace", message.event));
            return;
          case "line":
            controller.enqueue(encodeSse("line", { line: message.line }));
            return;
          case "done":
            controller.enqueue(encodeSse("done", message.data));
            closed = true;
            unsubscribe?.();
            controller.close();
            return;
          case "error":
            controller.enqueue(
              encodeSse("error", { message: message.message }),
            );
            closed = true;
            unsubscribe?.();
            controller.close();
        }
      };

      unsubscribe = subscribeTraceBridge(tabId, push);
    },
    cancel() {
      closed = true;
      unsubscribe?.();
    },
  });

  req.signal.addEventListener("abort", () => {
    closed = true;
    unsubscribe?.();
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
