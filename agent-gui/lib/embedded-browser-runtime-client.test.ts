import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEmbeddedBrowserHealthUrl,
  buildEmbeddedBrowserInvokeUrl,
  DEFAULT_EMBEDDED_BROWSER_PORT,
} from "@/lib/embedded-browser-config";
import {
  isEmbeddedBrowserRuntimeUnreachableMessage,
  shouldFallbackToPlaywrightBrowserResult,
} from "@/lib/embedded-browser-runtime-client.server";

describe("embedded-browser-config", () => {
  it("builds default health and invoke URLs", () => {
    assert.equal(
      buildEmbeddedBrowserHealthUrl("127.0.0.1", DEFAULT_EMBEDDED_BROWSER_PORT),
      "http://127.0.0.1:6018/health",
    );
    assert.equal(
      buildEmbeddedBrowserInvokeUrl("127.0.0.1", DEFAULT_EMBEDDED_BROWSER_PORT),
      "http://127.0.0.1:6018/v1/invoke",
    );
  });
});

describe("embedded-browser-runtime-client", () => {
  it("detects unreachable native runtime messages", () => {
    assert.equal(
      isEmbeddedBrowserRuntimeUnreachableMessage("fetch failed"),
      true,
    );
    assert.equal(
      isEmbeddedBrowserRuntimeUnreachableMessage("ECONNREFUSED 127.0.0.1:6018"),
      true,
    );
    assert.equal(
      isEmbeddedBrowserRuntimeUnreachableMessage("webview is not mounted"),
      false,
    );
  });

  it("falls back to playwright when native is unreachable or unmounted", () => {
    assert.equal(
      shouldFallbackToPlaywrightBrowserResult({
        ok: false,
        message: "fetch failed. Expected automation server",
      }),
      true,
    );
    assert.equal(
      shouldFallbackToPlaywrightBrowserResult({
        ok: false,
        error: "embedded browser webview is not mounted",
      }),
      true,
    );
    assert.equal(
      shouldFallbackToPlaywrightBrowserResult({ ok: true }),
      false,
    );
  });
});
