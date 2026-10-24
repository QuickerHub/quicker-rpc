import { traceBridge } from "@/lib/action-trace-bridge.server";
import { readTraceRunOwner } from "@/lib/action-trace-owner";
export const runtime = "nodejs";
export async function GET(req: Request) {
  let owner;
  try {
    owner = readTraceRunOwner(JSON.parse(new URL(req.url).searchParams.get("owner") ?? "null"));
  }
  catch { /* Invalid observer input. */ }
  if (!owner)
    return Response.json({ ok: false, error: "INVALID_TRACE_OWNER" }, { status: 400 });
  if (req.signal.aborted)
    return Response.json({ ok: false, error: "REQUEST_ABORTED" }, { status: 499 });
  if (!traceBridge.has(owner))
    return Response.json({ ok: false, error: "TRACE_RUN_EXPIRED" }, { status: 404 });
  let unsubscribe: (() => void) | undefined;
  let closed = false;
  let closeStream: (() => void) | undefined;
  const close = () => { if (closed)
    return; closed = true; unsubscribe?.(); req.signal.removeEventListener("abort", close); closeStream?.(); };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      closeStream = () => controller.close();
      unsubscribe = traceBridge.subscribe(owner!, (event) => {
        if (closed)
          return;
        const data = event.type === "trace" ? event.event : event.type === "line" ? { line: event.line } : event.data;
        controller.enqueue(new TextEncoder().encode(`event: ${event.type}\ndata: ${JSON.stringify(data)}\n\n`));
        if (event.type === "done")
          close();
      });
      if (!unsubscribe && !closed) {
        controller.enqueue(new TextEncoder().encode(`event: done\ndata: ${JSON.stringify({ ok: false, error: "TRACE_RUN_EXPIRED", traceOwner: owner })}\n\n`));
        close();
      }
      if (closed)
        unsubscribe?.();
      else {
        req.signal.addEventListener("abort", close, { once: true });
        if (req.signal.aborted)
          close();
      }
    },
    cancel() { closeStream = undefined; close(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform" } });
}
