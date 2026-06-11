import test from "node:test";
import assert from "node:assert/strict";
import {
  computeAppMessageHostOffset,
  DEFAULT_APP_MESSAGE_HOST_OFFSET,
  type RectLike,
} from "@/lib/app-message-host-position";

const VIEWPORT = { viewportWidth: 1600, viewportHeight: 900 };

function rect(left: number, top: number, right: number, bottom: number): RectLike {
  return { left, top, right, bottom };
}

test("keeps default offset when no webview is present", () => {
  const offset = computeAppMessageHostOffset({
    webviewRects: [],
    ...VIEWPORT,
    stackHeight: 120,
  });
  assert.deepEqual(offset, DEFAULT_APP_MESSAGE_HOST_OFFSET);
});

test("keeps default offset when webview does not overlap the toast region", () => {
  // Webview on the left half; toast stays bottom-right.
  const offset = computeAppMessageHostOffset({
    webviewRects: [rect(0, 100, 700, 900)],
    ...VIEWPORT,
    stackHeight: 120,
  });
  assert.deepEqual(offset, DEFAULT_APP_MESSAGE_HOST_OFFSET);
});

test("slides left of a right-side webview panel", () => {
  // Webview covers the right panel from x=900 to the window edge.
  const offset = computeAppMessageHostOffset({
    webviewRects: [rect(900, 100, 1600, 900)],
    ...VIEWPORT,
    stackHeight: 120,
  });
  assert.equal(offset.bottom, DEFAULT_APP_MESSAGE_HOST_OFFSET.bottom);
  // right offset puts the toast's right edge left of the webview with a gap.
  assert.equal(offset.right, 1600 - 900 + 12);
});

test("moves above the webview when there is no room on the left", () => {
  // Webview spans nearly the full width but leaves space above.
  const offset = computeAppMessageHostOffset({
    webviewRects: [rect(40, 400, 1600, 900)],
    ...VIEWPORT,
    stackHeight: 120,
  });
  assert.equal(offset.right, DEFAULT_APP_MESSAGE_HOST_OFFSET.right);
  assert.equal(offset.bottom, 900 - 400 + 12);
});

test("falls back to default when the webview covers almost everything", () => {
  const offset = computeAppMessageHostOffset({
    webviewRects: [rect(0, 0, 1600, 900)],
    ...VIEWPORT,
    stackHeight: 120,
  });
  assert.deepEqual(offset, DEFAULT_APP_MESSAGE_HOST_OFFSET);
});
