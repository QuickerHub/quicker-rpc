/** Cancel a pending connection without leaking a client which resolves after the race. */
export async function awaitMcpConnection<T extends { close: () => Promise<void> }>(
  pending: Promise<T>,
  options: {
    serverName: string;
    abortSignal?: AbortSignal;
    timeoutMs?: number;
    onAbandon?: () => void | Promise<void>;
    closeLateClient?: (client: T) => Promise<void>;
  },
): Promise<T> {
  let abandoned = false;
  let reason: unknown;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const abandon = (error: unknown) => {
    if (abandoned) return;
    abandoned = true;
    reason = error;
    // Stop real I/O even when initialization itself rejects before a client exists.
    // A broken cleanup callback must not replace the connection's original failure.
    try {
      void Promise.resolve(options.onAbandon?.()).catch(() => {});
    } catch {}
  };
  const connected = pending.then(async (client) => {
    if (abandoned) {
      await (options.closeLateClient?.(client) ?? client.close()).catch(() => {});
      throw reason;
    }
    return client;
  }, (error) => {
    abandon(error);
    throw error;
  });
  try {
    return await Promise.race([
      connected,
      new Promise<never>((_resolve, reject) => {
        const rejectConnection = (error: unknown) => {
          abandon(error);
          reject(error);
        };
        onAbort = () => rejectConnection(options.abortSignal!.reason);
        if (options.abortSignal?.aborted) onAbort();
        else {
          options.abortSignal?.addEventListener("abort", onAbort, { once: true });
          timeoutId = setTimeout(() => rejectConnection(new Error(
            `MCP server "${options.serverName}" initialization timed out after ${options.timeoutMs ?? 15_000}ms`,
          )), options.timeoutMs ?? 15_000);
        }
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (onAbort) options.abortSignal?.removeEventListener("abort", onAbort);
  }
}
