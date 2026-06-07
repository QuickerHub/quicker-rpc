import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildActionTraceTabId,
  formatActionTraceTabLabel,
  isActionTraceTabId,
  parseActionTraceTabId,
} from "./action-trace-tab-id";

describe("action-trace-tab-id", () => {
  it("builds stable tab ids per action and param", () => {
    const a = buildActionTraceTabId("d47c98d1-86be-40d0-ad02-87103f4dda1e");
    const b = buildActionTraceTabId(
      "d47c98d1-86be-40d0-ad02-87103f4dda1e",
      "path=C:\\a.txt",
    );
    assert.ok(isActionTraceTabId(a));
    assert.notEqual(a, b);
    assert.equal(
      parseActionTraceTabId(b)?.param,
      "path=C:\\a.txt",
    );
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
