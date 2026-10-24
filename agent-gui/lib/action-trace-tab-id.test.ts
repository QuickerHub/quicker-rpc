import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatActionTraceTabLabel,
  isActionTraceTabId,
} from "./action-trace-tab-id";

describe("action-trace-tab-id", () => {
  it("recognizes persisted legacy and owned/history trace view ids", () => {
    assert.equal(isActionTraceTabId("__trace__:d47c98d1-86be-40d0-ad02-87103f4dda1e::path%3DC%3A%5Ca.txt"), true);
    assert.equal(isActionTraceTabId("__trace__:owned:thread:execution:run"), true);
    assert.equal(isActionTraceTabId("__trace__:history:thread:message:call"), true);
  });

  it("rejects non-string view ids", () => {
    assert.equal(isActionTraceTabId(null as unknown as string), false);
    assert.equal(isActionTraceTabId((() => {}) as unknown as string), false);
  });

  it("formats running tab label", () => {
    const label = formatActionTraceTabLabel({
      actionId: "d47c98d1-86be-40d0-ad02-87103f4dda1e",
      actionTitle: "词频统计",
      status: "running",
    });
    assert.match(label, /词频统计 · 调试中/);
  });
});
