import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatDevTempWorkspaceCleanupSummary } from "@/lib/dev-temp-workspace-format";

describe("dev-temp-workspace-format", () => {
  test("formatDevTempWorkspaceCleanupSummary summarizes cleanup", () => {
    const summary = formatDevTempWorkspaceCleanupSummary({
      path: "D:/tmp/ws-abc",
      deletedActions: ["00000000-0000-0000-0000-000000000001"],
      deletedSubprograms: [],
      errors: [],
    });
    assert.match(summary, /Quicker 动作 1 个/);
    assert.match(summary, /临时目录已删除/);
  });
});
