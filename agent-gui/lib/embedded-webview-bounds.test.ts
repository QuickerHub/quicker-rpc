import assert from "node:assert/strict";
import { test } from "node:test";
import {
  boundsRectKey,
  measureEmbeddedWebViewHostLayout,
} from "@/lib/embedded-webview-bounds";
import {
  EMBEDDED_WEBVIEW_BOUNDS_REFRESH_EVENT,
  postEmbeddedWebViewBoundsRefresh,
} from "@/lib/embedded-webview-bounds-channel";

test("boundsRectKey rounds layout box for stable comparisons", () => {
  assert.equal(
    boundsRectKey({ left: 10.4, top: 20.6, width: 300.2, height: 400.8 } as DOMRect),
    "10,21,300,401",
  );
  assert.notEqual(
    boundsRectKey({ left: 10, top: 20, width: 300, height: 400 } as DOMRect),
    boundsRectKey({ left: 11, top: 20, width: 300, height: 400 } as DOMRect),
  );
});

test("measureEmbeddedWebViewHostLayout rounds logical host box", () => {
  const host = {
    getBoundingClientRect: () =>
      ({
        left: 12.4,
        top: 48.6,
        width: 520.2,
        height: 360.8,
      }) as DOMRect,
  } as HTMLElement;

  assert.deepEqual(measureEmbeddedWebViewHostLayout(host), {
    left: 12,
    top: 49,
    width: 520,
    height: 361,
  });
});

test("postEmbeddedWebViewBoundsRefresh dispatches a CustomEvent with layout detail", () => {
  if (typeof window === "undefined" || typeof CustomEvent === "undefined") {
    return;
  }

  const seen: string[] = [];
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ reason: string }>).detail;
    seen.push(detail.reason);
  };
  window.addEventListener(EMBEDDED_WEBVIEW_BOUNDS_REFRESH_EVENT, listener);

  postEmbeddedWebViewBoundsRefresh({
    layout: { left: 1, top: 2, width: 3, height: 4 },
    force: true,
    reason: "host-resize",
  });

  window.removeEventListener(EMBEDDED_WEBVIEW_BOUNDS_REFRESH_EVENT, listener);
  assert.deepEqual(seen, ["host-resize"]);
});
