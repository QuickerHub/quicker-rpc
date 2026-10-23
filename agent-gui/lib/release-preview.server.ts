import "server-only";

import { runWithReleasePreview } from "./release-preview-context";
import { readReleasePreview } from "./agent-service/chat-handler";
export { isReleasePreviewActive } from "./release-preview-context";

/** Cookies belong to the explicit HTTP request, for both Node and legacy Next. */
export function withReleasePreviewRoute<T>(request: Request, fn: () => T): T {
  return runWithReleasePreview(readReleasePreview(request), fn);
}
