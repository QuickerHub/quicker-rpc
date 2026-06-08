import type { ActionTraceEvent } from "@/lib/action-trace-format";
import { parseActionTraceEvent } from "@/lib/action-trace-format";

export type ActionTraceSseHandlers = {
  onLine?: (line: string) => void;
  onTrace?: (event: ActionTraceEvent) => void;
  onStart?: (data: Record<string, unknown>) => void;
  onDone: (data: Record<string, unknown>) => void;
  onError: (message: string) => void;
};

export function dispatchActionTraceSseBlock(
  block: string,
  handlers: ActionTraceSseHandlers,
): void {
  if (!block.trim() || block.trimStart().startsWith(":")) {
    return;
  }

  let eventName = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  const dataText = dataLines.join("\n");
  if (!dataText) {
    return;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(dataText) as Record<string, unknown>;
  } catch {
    handlers.onError("invalid SSE JSON");
    return;
  }

  if (eventName === "line") {
    if (typeof parsed.line === "string") {
      handlers.onLine?.(parsed.line);
    }
    return;
  }

  if (eventName === "trace" || eventName === "message") {
    const traceEvent = parseActionTraceEvent(parsed);
    if (traceEvent) {
      handlers.onTrace?.(traceEvent);
    }
    return;
  }

  if (eventName === "start") {
    handlers.onStart?.(parsed);
    return;
  }

  if (eventName === "done") {
    handlers.onDone(parsed);
    return;
  }

  if (eventName === "error") {
    const message =
      typeof parsed.message === "string" ? parsed.message : "trace failed";
    handlers.onError(message);
  }
}

export function drainActionTraceSseBuffer(
  buffer: string,
  handlers: ActionTraceSseHandlers,
): string {
  let rest = buffer;
  let splitAt = rest.indexOf("\n\n");
  while (splitAt >= 0) {
    const block = rest.slice(0, splitAt);
    rest = rest.slice(splitAt + 2);
    dispatchActionTraceSseBlock(block, handlers);
    splitAt = rest.indexOf("\n\n");
  }
  return rest;
}

function isAbortError(err: unknown): boolean {
  if (typeof DOMException !== "undefined" && err instanceof DOMException) {
    return err.name === "AbortError";
  }
  return err instanceof Error && err.name === "AbortError";
}

/** Incrementally read an SSE HTTP response body. */
export async function consumeActionTraceSseResponse(
  res: Response,
  signal: AbortSignal | undefined,
  handlers: ActionTraceSseHandlers,
): Promise<void> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    handlers.onError(text.trim() || `HTTP ${res.status}`);
    return;
  }

  if (!res.body) {
    handlers.onError("empty response body");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (err) {
        if (signal?.aborted || isAbortError(err)) {
          return;
        }
        throw err;
      }

      const { done, value } = chunk;
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      buffer = drainActionTraceSseBuffer(buffer, handlers);
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      drainActionTraceSseBuffer(`${buffer}\n\n`, handlers);
    }
  } catch (err) {
    if (signal?.aborted || isAbortError(err)) {
      return;
    }
    handlers.onError(err instanceof Error ? err.message : String(err));
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Reader may already be released after abort.
    }
  }
}

export async function consumeActionTraceSse(
  url: string,
  signal: AbortSignal,
  handlers: ActionTraceSseHandlers,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      signal,
      headers: { Accept: "text/event-stream" },
      cache: "no-store",
    });
  } catch (err) {
    if (signal.aborted) {
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    handlers.onError(message);
    return;
  }

  await consumeActionTraceSseResponse(res, signal, handlers);
}

export async function consumeActionTraceSsePost(
  url: string,
  body: string,
  signal: AbortSignal,
  handlers: ActionTraceSseHandlers,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      body,
      cache: "no-store",
    });
  } catch (err) {
    if (signal.aborted) {
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    handlers.onError(message);
    return;
  }

  await consumeActionTraceSseResponse(res, signal, handlers);
}
