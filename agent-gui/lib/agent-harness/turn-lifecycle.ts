export type TurnCleanup = () => void | Promise<void>;

export type AgentTurnLifecycle = {
  signal: AbortSignal;
  abort: (reason?: unknown) => void;
  /** A resource acquired after cancellation is released immediately. */
  defer: (cleanup: TurnCleanup) => Promise<void>;
  dispose: () => Promise<void>;
};

/** Own cancellation and cleanup for one turn, independently of its UI visibility. */
export function createAgentTurnLifecycle(options: {
  abortSignal?: AbortSignal;
  onCleanupError?: (error: unknown) => void;
} = {}): AgentTurnLifecycle {
  const controller = new AbortController();
  const cleanups: TurnCleanup[] = [];
  let disposed = false;
  let pendingCleanup = Promise.resolve();

  const scheduleCleanup = (cleanup: TurnCleanup) => {
    pendingCleanup = pendingCleanup
      .then(cleanup)
      .catch((error: unknown) => {
        // Cleanup failure must not skip another resource or replace the turn error.
        try { options.onCleanupError?.(error); } catch { /* Diagnostics are best-effort. */ }
      });
    return pendingCleanup;
  };
  const dispose = () => {
    if (!disposed) {
      disposed = true;
      options.abortSignal?.removeEventListener("abort", onParentAbort);
      for (const cleanup of cleanups.splice(0).reverse()) scheduleCleanup(cleanup);
    }
    return pendingCleanup;
  };
  const abort = (reason?: unknown) => {
    if (!controller.signal.aborted) controller.abort(reason);
    void dispose();
  };
  function onParentAbort() { abort(options.abortSignal?.reason); }

  if (options.abortSignal?.aborted) onParentAbort();
  else options.abortSignal?.addEventListener("abort", onParentAbort, { once: true });

  return {
    signal: controller.signal,
    abort,
    defer: (cleanup) => {
      if (disposed) return scheduleCleanup(cleanup);
      cleanups.push(cleanup);
      return Promise.resolve();
    },
    dispose,
  };
}

/** Propagate response cancellation back to the producer and release its reader. */
export function withAgentTurnCancellation<T>(
  stream: ReadableStream<T>,
  lifecycle: AgentTurnLifecycle,
): ReadableStream<T> {
  const reader = stream.getReader();
  let finished = false;
  let output: ReadableStreamDefaultController<T>;
  const detach = () => lifecycle.signal.removeEventListener("abort", onAbort);
  function onAbort() {
    if (finished) return;
    finished = true;
    detach();
    output.error(lifecycle.signal.reason);
  }
  void lifecycle.defer(async () => {
    try { await reader.cancel(lifecycle.signal.reason); }
    finally { reader.releaseLock(); }
  });

  return new ReadableStream<T>({
    start(controller) {
      output = controller;
      if (lifecycle.signal.aborted) onAbort();
      else lifecycle.signal.addEventListener("abort", onAbort, { once: true });
    },
    async pull(controller) {
      if (finished) return;
      try {
        const { done, value } = await reader.read();
        if (finished) return;
        if (done) {
          finished = true;
          detach();
          await lifecycle.dispose();
          controller.close();
        } else controller.enqueue(value);
      } catch (error) {
        if (finished) return;
        finished = true;
        detach();
        lifecycle.abort(error);
        await lifecycle.dispose();
        controller.error(error);
      }
    },
    async cancel(reason) {
      finished = true;
      detach();
      lifecycle.abort(reason);
      await lifecycle.dispose();
    },
  });
}
