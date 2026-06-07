import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDetailBlockTree,
  collectRunningDetailBlockIds,
  isDetailTreeBlock,
} from "./action-trace-detail-block-tree";
import type { ActionTraceTimelineRow } from "./action-trace-timeline-model";

function row(
  index: number,
  kind: string,
  label: string,
  depth = 0,
  running = false,
): ActionTraceTimelineRow {
  return {
    index,
    kind,
    label,
    depth,
    running,
    event: { kind, message: label },
  };
}

test("buildDetailBlockTree nests group and step blocks", () => {
  const rows: ActionTraceTimelineRow[] = [
    row(0, "input", "stopCondition = (null)", 0),
    row(1, "group_begin", "children=2", 0),
    row(2, "step_begin", "执行表达式", 1),
    row(3, "input", "expression = iter", 2),
    row(4, "step_end", "完成", 1),
    row(5, "step_begin", "赋值", 1),
    row(6, "output", "lastCount = iter#0", 2),
    row(7, "step_end", "完成", 1),
    row(8, "group_end", "group_end", 0),
  ];

  const tree = buildDetailBlockTree(rows);
  assert.equal(tree.length, 2);
  assert.equal(tree[0]?.kind, "row");
  assert.equal(tree[1]?.kind, "block");
  if (!isDetailTreeBlock(tree[1]!)) return;

  assert.equal(tree[1].blockType, "group");
  assert.equal(tree[1].children.length, 2);
  assert.equal(tree[1].children[0]?.kind, "block");
  assert.equal(tree[1].children[1]?.kind, "block");
});

test("collectRunningDetailBlockIds finds active step block", () => {
  const rows: ActionTraceTimelineRow[] = [
    row(0, "step_begin", "执行表达式", 0),
    row(1, "input", "expression = iter", 1, true),
    row(2, "step_end", "完成", 0),
  ];
  const tree = buildDetailBlockTree(rows);
  const ids = collectRunningDetailBlockIds(tree);
  assert.deepEqual(ids, ["trace-block-0-step_begin"]);
});
