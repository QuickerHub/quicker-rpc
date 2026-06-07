import assert from "node:assert/strict";
import test from "node:test";
import { formatTraceEventLine } from "./action-trace-format";

test("formatTraceEventLine renders step begin", () => {
  const line = formatTraceEventLine({
    kind: "step_begin",
    depth: 1,
    stepRunnerName: "重复",
    elapsedMs: 2,
  });
  assert.equal(line, "  > 重复 +2ms");
});

test("formatTraceEventLine renders info message", () => {
  const line = formatTraceEventLine({
    kind: "info",
    depth: 0,
    message: "开始执行动作",
  });
  assert.equal(line, " . 开始执行动作");
});
