import { MCP_CLOSE_TIMEOUT_MS } from "./client-owner";

/** The SDK awaits DELETE before aborting HTTP transport; own that request's deadline. */
export function createMcpTransportFetch(options: {
  abortSignal: AbortSignal;
  fetch?: typeof globalThis.fetch;
  closeTimeoutMs?: number;
}): typeof globalThis.fetch {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  return async (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const sourceSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    if (method !== "DELETE") {
      const signal = sourceSignal
        ? AbortSignal.any([options.abortSignal, sourceSignal])
        : options.abortSignal;
      signal.throwIfAborted();
      return fetchImpl(input, { ...init, signal });
    }

    // Session deletion may finish after turn cancellation, but never wait indefinitely.
    const deadline = new AbortController();
    const signal = sourceSignal ? AbortSignal.any([sourceSignal, deadline.signal]) : deadline.signal;
    const timer = setTimeout(() => deadline.abort(new DOMException("MCP session deletion timed out", "TimeoutError")),
      options.closeTimeoutMs ?? MCP_CLOSE_TIMEOUT_MS);
    try {
      signal.throwIfAborted();
      return await fetchImpl(input, { ...init, signal });
    } finally {
      clearTimeout(timer);
      // DELETE response bodies are unused by the SDK; abort also releases a streaming body.
      deadline.abort(new DOMException("MCP session deletion finished", "AbortError"));
    }
  };
}
