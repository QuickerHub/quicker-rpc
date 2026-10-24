import {
  DesignerCatalogError,
  designerCatalogTargetKey,
  withDesignerCatalogContext,
  type DesignerCatalogScope,
} from "./designerCatalogContext";

type Pending = { controller: AbortController; promise: Promise<unknown>; waiters: number };
const MAX_CACHED_VALUES = 256;

export type DesignerCatalogPort = ReturnType<typeof createDesignerCatalogPort>;

function abortReason(signal?: AbortSignal): unknown {
  return signal?.reason ?? new DOMException("Catalog request cancelled", "AbortError");
}

/** One document owns its target, cache and request lifetime; a waiter never owns another waiter's request. */
export function createDesignerCatalogPort(scope: DesignerCatalogScope, fetcher: typeof fetch = fetch) {
  const context = scope == null ? scope : structuredClone(scope);
  const key = designerCatalogTargetKey(context);
  const values = new Map<string, unknown>();
  const pending = new Map<string, Pending>();
  let closed = false;
  const remoteEnabled = context === undefined || (context !== null && context.expectedProjectBinding !== null);
  const documentBound = context !== undefined && context !== null && context.expectedProjectBinding !== null;

  function shared<T>(requestKey: string, load: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (closed) return Promise.reject(new DesignerCatalogError("STALE_CATALOG_OWNER", "The document catalog has closed."));
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    let entry = pending.get(requestKey);
    if (!entry) {
      const controller = new AbortController();
      entry = { controller, promise: Promise.resolve(), waiters: 0 };
      const owned = entry;
      owned.promise = Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return load(controller.signal);
      }).then((value) => {
        if (closed || controller.signal.aborted || pending.get(requestKey) !== owned) throw abortReason(controller.signal);
        return value;
      }).finally(() => {
        if (pending.get(requestKey) === owned) pending.delete(requestKey);
      });
      pending.set(requestKey, owned);
    }
    const owned = entry;
    owned.waiters += 1;
    return new Promise<T>((resolve, reject) => {
      let done = false;
      const finish = (callback: () => void) => {
        if (done) return;
        done = true;
        signal?.removeEventListener("abort", onAbort);
        owned.controller.signal.removeEventListener("abort", onOwnerAbort);
        owned.waiters -= 1;
        if (owned.waiters === 0 && pending.get(requestKey) === owned) {
          pending.delete(requestKey);
          owned.controller.abort();
        }
        callback();
      };
      const onAbort = () => finish(() => reject(abortReason(signal)));
      const onOwnerAbort = () => finish(() => reject(abortReason(owned.controller.signal)));
      signal?.addEventListener("abort", onAbort, { once: true });
      owned.controller.signal.addEventListener("abort", onOwnerAbort, { once: true });
      owned.promise.then((value) => finish(() => resolve(value as T)), (error) => finish(() => reject(error)));
    });
  }

  return {
    key, remoteEnabled, documentBound,
    get<T>(cacheKey: string): T | undefined {
      if (closed || !values.has(cacheKey)) return undefined;
      const value = values.get(cacheKey);
      values.delete(cacheKey);
      values.set(cacheKey, value);
      return value as T;
    },
    set<T>(cacheKey: string, value: T): void {
      if (closed) return;
      values.delete(cacheKey);
      values.set(cacheKey, value);
      if (values.size > MAX_CACHED_VALUES) values.delete(values.keys().next().value!);
    },
    shared,
    async request<T>(path: string, payload: object, signal?: AbortSignal): Promise<T> {
      if (!remoteEnabled) throw new DesignerCatalogError("CATALOG_TARGET_UNAVAILABLE", "This document has no bound catalog target.");
      const body = JSON.stringify(withDesignerCatalogContext(payload, context));
      return shared(`${path}\0${body}`, async (ownedSignal) => {
        const response = await fetcher(path, {
          method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body, signal: ownedSignal,
        });
        const data = await response.json() as T & { ok?: boolean; code?: string; error?: string };
        if (!response.ok || data.ok === false) {
          throw new DesignerCatalogError(data.code ?? "CATALOG_REQUEST_FAILED", data.error ?? `HTTP ${response.status}`, response.status);
        }
        return data;
      }, signal);
    },
    dispose(): void {
      if (closed) return;
      closed = true;
      for (const entry of pending.values()) entry.controller.abort();
      pending.clear();
      values.clear();
    },
  };
}
