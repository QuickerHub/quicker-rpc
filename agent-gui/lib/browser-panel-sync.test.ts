import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  browserPanelPatchFromToolOutput,
  browserPanelSyncFromToolOutput,
} from "./browser-panel-sync";

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

  it("opens panel and navigates on navigate action", () => {
    const intent = browserPanelSyncFromToolOutput({
      ok: true,
      exitCode: 0,
      source: "local",
      data: {
        action: "navigate",
        url: "https://example.com/",
        title: "",
        mode: "native",
        deferred: true,
      },
    });
    assert.ok(intent);
    assert.equal(intent?.patch.url, "https://example.com/");
    assert.equal(intent?.openPanel, true);
    assert.equal(intent?.navigate, true);
  });

  it("opens panel without reload on snapshot action", () => {
    const intent = browserPanelSyncFromToolOutput({
      ok: true,
      exitCode: 0,
      source: "local",
      data: {
        action: "snapshot",
        url: "https://example.com/",
        title: "Example",
        snapshot: "url: https://example.com/",
      },
    });
    assert.ok(intent);
    assert.equal(intent?.openPanel, true);
    assert.equal(intent?.navigate, false);
  });
});
