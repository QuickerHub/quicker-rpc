import { test } from "node:test";
import assert from "node:assert/strict";
import { browserPanelPatchFromData } from "./browser-panel-patch.ts";

test("browserPanelPatchFromData maps screenshot base64 fields", () => {
  const patch = browserPanelPatchFromData({
    url: "about:blank",
    base64: "abc123",
    mimeType: "image/png",
    viewportWidth: 1280,
    viewportHeight: 800,
  });
  assert.equal(patch?.previewBase64, "abc123");
  assert.equal(patch?.previewMimeType, "image/png");
  assert.equal(patch?.url, "about:blank");
});

test("browserPanelPatchFromData prefers previewBase64", () => {
  const patch = browserPanelPatchFromData({
    previewBase64: "jpegdata",
    previewMimeType: "image/jpeg",
  });
  assert.equal(patch?.previewBase64, "jpegdata");
  assert.equal(patch?.previewMimeType, "image/jpeg");
});
