import assert from "node:assert/strict";
import test from "node:test";
import { buildCompactIterationView } from "./action-trace-loop-iteration-view";
import type { ActionTraceTimelineRow } from "./action-trace-timeline-model";

function row(
  index: number,
  kind: string,
  label: string,
  depth = 0,
  stepId?: string,
): ActionTraceTimelineRow {
  return {
    index,
    kind,
    label,
    depth,
    running: false,
    event: { kind, stepId, message: label },
  };
}

test("buildCompactIterationView folds step inputs and hides groups", () => {
  const rows: ActionTraceTimelineRow[] = [
    row(0, "input", "stopCondition = (null)", 0),
    row(1, "group_begin", "children=2", 0),
    row(2, "step_begin", "执行表达式", 1, "s-1"),
    row(3, "input", "expression = iter", 2),
    row(4, "input", "onUiThread = False", 2),
    row(5, "output", "result = iter#0", 2),
    row(6, "step_end", "完成", 1, "s-1"),
    row(7, "step_begin", "赋值", 1, "s-2"),
    row(8, "output", "lastCount = iter#0", 2),
    row(9, "step_end", "完成", 1, "s-2"),
    row(10, "group_end", "group_end", 0),
  ];

  const items = buildCompactIterationView(rows);
  assert.equal(items.length, 3);
  assert.equal(items[0]?.kind, "row");
  assert.equal(items[1]?.kind, "fold");
  assert.equal(items[2]?.kind, "fold");
  if (items[1]?.kind === "fold") {
    assert.match(items[1].label, /执行表达式/);
    assert.match(items[1].label, /result = iter#0/);
  }
});
