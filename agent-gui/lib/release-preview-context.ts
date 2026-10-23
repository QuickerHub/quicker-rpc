import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage<boolean>();

/** Runtime configuration policy; HTTP adapters supply the per-request value. */
export function isReleasePreviewActive(): boolean {
  return storage.getStore() ?? false;
}

export function runWithReleasePreview<T>(preview: boolean, fn: () => T): T {
  return storage.run(preview, fn);
}
