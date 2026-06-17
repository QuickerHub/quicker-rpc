import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeBrowserToActionTool } from "@/lib/browser-to-action-tool.server";
import {
  appendBrowserRecording,
  clearBrowserRecordings,
} from "@/lib/browser-to-action/recording";

describe("browser_to_action tool", () => {
  it("reads session recordings", async () => {
    clearBrowserRecordings("test-session");
    appendBrowserRecording("test-session", {
      source: "browser",
      input: { action: "navigate", url: "https://example.com" },
    });
    appendBrowserRecording("test-session", {
      source: "browser",
      input: { action: "evaluate", script: "document.title" },
    });

    const result = await executeBrowserToActionTool({
      source: "session",
      sessionId: "test-session",
      addComments: false,
    });

    assert.equal(result.ok, true);
    const data = result.data as Record<string, unknown>;
    assert.ok(data.dataJson);
    clearBrowserRecordings("test-session");
  });
});
