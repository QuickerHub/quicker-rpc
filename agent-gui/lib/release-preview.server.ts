import "server-only";

import { cookies } from "next/headers";
import { RELEASE_PREVIEW_COOKIE } from "@/lib/release-preview-constants";
import { runWithReleasePreview } from "@/lib/release-preview-context";
export { isReleasePreviewActive } from "@/lib/release-preview-context";

export async function readReleasePreviewFromCookies(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(RELEASE_PREVIEW_COOKIE)?.value === "1";
}

/** Per-request AsyncLocalStorage scope for publish-config / LLM resolution. */
export async function withReleasePreviewContext<T>(
  fn: () => T | Promise<T>,
): Promise<T> {
  const preview = await readReleasePreviewFromCookies();
  return runWithReleasePreview(preview, fn);
}

export async function withReleasePreviewRoute<T>(
  fn: () => T | Promise<T>,
): Promise<T> {
  return withReleasePreviewContext(fn);
}
