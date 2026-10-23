/** Each invoke owns its cancellation; a session and its browser are shared resources. */
export function createBrowserOperationOwner(signal) {
  const local = new AbortController();
  signal = signal ? AbortSignal.any([signal, local.signal]) : local.signal;
  const checkpoint = () => { signal?.throwIfAborted(); };
  return Object.freeze({
    signal,
    checkpoint,
    cancel(reason) { local.abort(reason); },
    async wait(execute) {
      checkpoint();
      try {
        return await execute();
      } finally {
        checkpoint();
      }
    },
    pause(ms) {
      checkpoint();
      return new Promise((resolve, reject) => {
        const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); };
        const abort = () => { cleanup(); reject(signal.reason); };
        const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
        signal.addEventListener("abort", abort, { once: true });
      });
    },
  });
}

/** A cancelled caller leaves promptly; the underlying native promise is still observed. */
export function waitForBrowserOperation(pending, owner) {
  const signal = owner.signal;
  if (!signal) return pending;
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason); };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    void pending.then((value) => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) reject(signal.reason);
      else resolve(value);
    }, (error) => {
      signal.removeEventListener("abort", abort);
      reject(signal.aborted ? signal.reason : error);
    });
  });
}

export class BrowserOperationQueue {
  constructor() { this._tails = new Map(); }
  get pendingSessionCount() { return this._tails.size; }

  run(sessionId, owner, execute) {
    owner.checkpoint();
    const previous = this._tails.get(sessionId) ?? Promise.resolve();
    const work = previous.then(async () => {
      owner.checkpoint();
      const result = await execute(owner);
      owner.checkpoint();
      return result;
    });
    // Never use the caller's cancellation race as the queue tail: native work may still be running.
    const tail = work.then(() => undefined, () => undefined);
    this._tails.set(sessionId, tail);
    void tail.then(() => { if (this._tails.get(sessionId) === tail) this._tails.delete(sessionId); });
    return waitForBrowserOperation(work, owner);
  }
}
