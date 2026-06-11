import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEmbeddedBrowserHealthUrl,
  buildEmbeddedBrowserInvokeUrl,
  DEFAULT_EMBEDDED_BROWSER_PORT,
} from "@/lib/embedded-browser-config";

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
