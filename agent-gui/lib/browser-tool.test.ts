import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeBrowserTool } from "@/lib/browser-tool.server";

describe("browser-tool", () => {
  it("rejects navigate without url", async () => {
    const result = await executeBrowserTool({ action: "navigate" });
    assert.equal(result.ok, false);
    assert.match(String(result.stderr ?? ""), /url is required/i);
  });
});
