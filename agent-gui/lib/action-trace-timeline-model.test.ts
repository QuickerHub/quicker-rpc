import assert from "node:assert/strict";
import test from "node:test";
import {
  parseActionTraceEvent,
  parseActionTraceEvents,
} from "./action-trace-format";
import {
  buildActionTraceTimelineRows,
  isStepBeginRunning,
} from "./action-trace-timeline-model";

test("parseActionTraceEvent reads camelCase payload", () => {
  const event = parseActionTraceEvent({
    sequence: 1,
    kind: "step_begin",
    depth: 2,
    stepId: "s1",
    stepRunnerName: "赋值",
    elapsedMs: 3,
  });
  assert.equal(event?.kind, "step_begin");
  assert.equal(event?.stepRunnerName, "赋值");
  assert.equal(event?.depth, 2);
});

test("parseActionTraceEvents skips invalid items", () => {
  const events = parseActionTraceEvents([
    { kind: "info", message: "ok" },
    null,
    { noKind: true },
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.message, "ok");
});

test("isStepBeginRunning until matching step_end", () => {
  const events = [
    { kind: "step_begin", stepId: "a" },
    { kind: "input", paramKey: "x" },
    { kind: "step_end", stepId: "a" },
    { kind: "step_begin", stepId: "b" },
  ];
  assert.equal(isStepBeginRunning(events, 0), false);
  assert.equal(isStepBeginRunning(events, 3), true);
});

test("buildActionTraceTimelineRows marks live running step", () => {
  const events = [
    { kind: "step_begin", stepId: "a", stepRunnerName: "表达式" },
  ];
  const rows = buildActionTraceTimelineRows(events, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.running, true);
  assert.match(rows[0]?.label ?? "", /表达式/);
});
