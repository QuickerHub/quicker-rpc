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

  it("opens panel on deferred embedded navigate", () => {
    const intent = browserPanelSyncFromToolOutput({
      ok: true,
      exitCode: 0,
      source: "local",
      data: {
        action: "navigate",
        url: "https://example.com/",
        title: "",
        mode: "embedded",
        deferred: true,
      },
    });
    assert.ok(intent);
    assert.equal(intent?.patch.url, "https://example.com/");
    assert.equal(intent?.openPanel, true);
    assert.equal(intent?.navigate, true);
  });

  it("skips panel sync for headless agent background results", () => {
    const intent = browserPanelSyncFromToolOutput({
      ok: true,
      exitCode: 0,
      source: "local",
      data: {
        action: "evaluate",
        url: "https://example.com/",
        mode: "headless",
        background: true,
        value: { title: "Example" },
      },
    });
    assert.equal(intent, null);
  });

  it("skips panel sync for offscreen embedded without showPanel", () => {
    const intent = browserPanelSyncFromToolOutput({
      ok: true,
      exitCode: 0,
      source: "local",
      data: {
        action: "evaluate",
        url: "https://example.com/",
        mode: "embedded",
        value: { title: "Example" },
      },
    });
    assert.equal(intent, null);
  });

  it("opens panel when showPanel is true", () => {
    const intent = browserPanelSyncFromToolOutput({
      ok: true,
      exitCode: 0,
      source: "local",
      data: {
        action: "navigate",
        url: "https://example.com/",
        mode: "embedded",
        showPanel: true,
      },
    });
    assert.ok(intent);
    assert.equal(intent?.openPanel, true);
    assert.equal(intent?.navigate, true);
  });

  it("opens panel for panel API sync flag without reload on snapshot", () => {
    const intent = browserPanelSyncFromToolOutput({
      ok: true,
      exitCode: 0,
      source: "local",
      data: {
        action: "snapshot",
        url: "https://example.com/",
        title: "Example",
        mode: "embedded",
        panelSync: true,
        snapshot: "url: https://example.com/",
      },
    });
    assert.ok(intent);
    assert.equal(intent?.openPanel, true);
    assert.equal(intent?.navigate, false);
  });
});
