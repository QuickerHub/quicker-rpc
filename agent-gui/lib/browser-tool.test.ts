import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeBrowserTool } from "@/lib/browser-tool.server";

describe("browser-tool", () => {
  it("rejects navigate without url", async () => {
    const result = await executeBrowserTool({ action: "navigate" });
    assert.equal(result.ok, false);
    assert.match(String(result.stderr ?? ""), /url is required/i);
  });

  it("rejects click_xy without coordinates", async () => {
    const result = await executeBrowserTool({ action: "click_xy" });
    assert.equal(result.ok, false);
    assert.match(String(result.stderr ?? ""), /x and y are required/i);
  });

  it("rejects screenshot for agent audience", async () => {
    const result = await executeBrowserTool({ action: "screenshot" });
    assert.equal(result.ok, false);
    assert.match(String(result.stderr ?? ""), /not available to the agent/i);
  });

  it("rejects evaluate without script", async () => {
    const result = await executeBrowserTool({ action: "evaluate" });
    assert.equal(result.ok, false);
    assert.match(String(result.stderr ?? ""), /script is required/i);
  });
});
