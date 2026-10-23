/** Stop this caller's wait without cancelling shared startup or another caller's work. */
export function awaitBrowserRequest<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    // Observe late rejection as well as late success after this caller has left.
    void pending.then((value) => {
      if (signal.aborted) reject(signal.reason);
      else resolve(value);
    }, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export async function waitForBrowserPoll(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await awaitBrowserRequest(new Promise<void>((resolve) => { timer = setTimeout(resolve, ms); }), signal);
  } finally {
    clearTimeout(timer);
  }
}
