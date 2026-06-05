import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { cookies } from "next/headers";
import { RELEASE_PREVIEW_COOKIE } from "@/lib/release-preview-constants";

const storage = new AsyncLocalStorage<boolean>();

/** True inside API handlers wrapped with withReleasePreviewContext. */
export function isReleasePreviewActive(): boolean {
  return storage.getStore() ?? false;
}

export async function readReleasePreviewFromCookies(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(RELEASE_PREVIEW_COOKIE)?.value === "1";
}

/** Per-request AsyncLocalStorage scope for publish-config / LLM resolution. */
export async function withReleasePreviewContext<T>(
  fn: () => T | Promise<T>,
): Promise<T> {
  const preview = await readReleasePreviewFromCookies();
  return storage.run(preview, fn);
}

export async function withReleasePreviewRoute<T>(
  fn: () => T | Promise<T>,
): Promise<T> {
  return withReleasePreviewContext(fn);
}
