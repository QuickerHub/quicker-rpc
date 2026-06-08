import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isToolTestSidebarTab } from "./tool-test-sidebar-prefs.ts";

describe("isToolTestSidebarTab", () => {
  it("accepts known tab ids", () => {
    assert.equal(isToolTestSidebarTab("launcher"), true);
    assert.equal(isToolTestSidebarTab("prompt-chat"), true);
  });

  it("rejects unknown values", () => {
    assert.equal(isToolTestSidebarTab("unknown"), false);
    assert.equal(isToolTestSidebarTab(null), false);
  });
});
