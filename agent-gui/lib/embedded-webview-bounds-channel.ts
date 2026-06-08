import type { EmbeddedWebViewHostLayout } from "@/lib/embedded-webview-bounds";

/** DOM event: HTML host layer measured a new bounds box for the native child webview. */
export const EMBEDDED_WEBVIEW_BOUNDS_REFRESH_EVENT =
  "embedded-webview-bounds-refresh";

export type EmbeddedWebViewBoundsRefreshReason =
  | "host-resize"
  | "ancestor-resize"
  | "workspace-layout"
  | "window-resize"
  | "layout-drag"
  | "shell-layout"
  | "manual";

export type EmbeddedWebViewBoundsRefreshMessage = {
  /** Measured host box in logical/CSS pixels (optional when only forcing re-read). */
  layout?: EmbeddedWebViewHostLayout;
  force?: boolean;
  reason: EmbeddedWebViewBoundsRefreshReason;
};

/** Post a bounds refresh message from the HTML host layer to the native webview sync handler. */
export function postEmbeddedWebViewBoundsRefresh(
  message: EmbeddedWebViewBoundsRefreshMessage,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<EmbeddedWebViewBoundsRefreshMessage>(
      EMBEDDED_WEBVIEW_BOUNDS_REFRESH_EVENT,
      { detail: message },
    ),
  );
}

/** Subscribe to bounds refresh messages (HTML host → native webview). */
export function subscribeEmbeddedWebViewBoundsRefresh(
  handler: (message: EmbeddedWebViewBoundsRefreshMessage) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const listener = (event: Event) => {
    const detail = (event as CustomEvent<EmbeddedWebViewBoundsRefreshMessage>)
      .detail;
    if (!detail) return;
    handler(detail);
  };

  window.addEventListener(EMBEDDED_WEBVIEW_BOUNDS_REFRESH_EVENT, listener);
  return () => {
    window.removeEventListener(EMBEDDED_WEBVIEW_BOUNDS_REFRESH_EVENT, listener);
  };
}
