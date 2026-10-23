export const MCP_CLOSE_TIMEOUT_MS = 2_000;

export type McpCloseable = { close: () => void | Promise<void> };

export type McpClientOwner = {
  signal: AbortSignal;
  register: (resource: McpCloseable) => Promise<() => Promise<void>>;
  dispose: () => Promise<void>;
};

/** Start independent closes together; one broken server cannot retain other clients. */
export function createMcpClientOwner(options: {
  abortSignal?: AbortSignal;
  closeTimeoutMs?: number;
  onCloseError?: (error: unknown) => void;
} = {}): McpClientOwner {
  const controller = new AbortController();
  const resources = new Set<() => Promise<void>>();
  const closers = new WeakMap<McpCloseable, () => Promise<void>>();
  let disposed = false;
  let disposing: Promise<void> | undefined;

  const report = (error: unknown) => {
    try { options.onCloseError?.(error); } catch { /* Cleanup diagnostics cannot change the turn outcome. */ }
  };
  const dispose = () => {
    if (!disposed) {
      disposed = true;
      options.abortSignal?.removeEventListener("abort", onAbort);
      controller.abort(options.abortSignal?.reason ?? new DOMException("MCP resources disposed", "AbortError"));
      disposing = Promise.all([...resources].map((close) => close())).then(() => {});
    }
    return disposing ?? Promise.resolve();
  };
  function onAbort() { void dispose(); }
  if (options.abortSignal?.aborted) onAbort();
  else options.abortSignal?.addEventListener("abort", onAbort, { once: true });

  return {
    signal: controller.signal,
    register: async (resource) => {
      let close = closers.get(resource);
      if (!close) {
        let closing: Promise<void> | undefined;
        close = () => closing ??= (async () => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              Promise.resolve().then(() => resource.close()),
              new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error("MCP resource close timed out")),
                  options.closeTimeoutMs ?? MCP_CLOSE_TIMEOUT_MS);
              }),
            ]);
          } catch (error) {
            report(error);
          } finally {
            if (timer) clearTimeout(timer);
            resources.delete(close!);
          }
        })();
        closers.set(resource, close);
        resources.add(close);
      }
      if (disposed) await close();
      return close;
    },
    dispose,
  };
}
