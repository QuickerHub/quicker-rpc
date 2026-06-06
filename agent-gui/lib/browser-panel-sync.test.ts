import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { browserPanelPatchFromToolOutput } from "./browser-panel-sync";

describe("browser-panel-sync", () => {
  it("extracts url and preview from structured browser tool output", () => {
    const patch = browserPanelPatchFromToolOutput({
      ok: true,
      exitCode: 0,
      source: "local",
      data: {
        action: "navigate",
        sessionId: "default",
        url: "https://example.com/",
        title: "Example",
        previewBase64: "abc123",
        previewMimeType: "image/jpeg",
        viewportWidth: 1280,
        viewportHeight: 800,
      },
    });
    assert.ok(patch);
    assert.equal(patch?.url, "https://example.com/");
    assert.equal(patch?.previewBase64, "abc123");
  });
});
