import assert from "node:assert/strict";
import test from "node:test";
import type { ActionTraceEvent } from "./action-trace-format";
import {
  buildLoopTraceModuleModel,
  collectRepeatSetupRows,
  findRepeatStepLoopGroup,
  isRepeatStepLoopModule,
  parseLoopIterationIndex,
} from "./action-trace-loop-module-model";
import { parseTraceBlocks } from "./action-trace-timeline-collapse";
import { buildActionTraceTimelineRows } from "./action-trace-timeline-model";

function findRepeatStep(events: ActionTraceEvent[]) {
  const blocks = parseTraceBlocks(events);
  const file = blocks.find((block) => block.type === "file");
  return file?.children
    .find((block) => block.type === "group")
    ?.children.find(
      (block) =>
        block.type === "step"
        && events[block.start]?.stepRunnerKey === "sys:repeat",
    );
}

test("parseLoopIterationIndex handles chinese repeat note", () => {
  assert.equal(parseLoopIterationIndex("第 0 次循环。"), 0);
  assert.equal(parseLoopIterationIndex("第 59 次循环。"), 59);
});

test("buildLoopTraceModuleModel reads repeat config and iterations", () => {
  const events: ActionTraceEvent[] = [
    { kind: "file_begin", depth: 0, message: "trace begin" },
    { kind: "group_begin", depth: 0, message: "children=1" },
    {
      kind: "step_begin",
      depth: 1,
      stepId: "s-1",
      stepRunnerKey: "sys:repeat",
      stepRunnerName: "重复",
    },
    { kind: "input", depth: 2, paramKey: "count", paramValue: "3" },
    {
      kind: "input",
      depth: 2,
      paramKey: "repeatDelayMs",
      paramValue: "120",
    },
    { kind: "group_begin", depth: 2, message: "children=1" },
    { kind: "repeat_begin", depth: 3, note: "第 0 次循环。" },
    { kind: "repeat_end", depth: 3 },
    { kind: "repeat_begin", depth: 3, note: "第 1 次循环。" },
    { kind: "repeat_end", depth: 3 },
    { kind: "group_end", depth: 2 },
    { kind: "step_end", depth: 1, stepId: "s-1" },
    { kind: "group_end", depth: 0 },
    { kind: "file_end", depth: 0, message: "trace end" },
  ];

  const repeatStep = findRepeatStep(events);
  assert.ok(repeatStep);
  assert.equal(isRepeatStepLoopModule(repeatStep, events), true);
  const loopGroup = findRepeatStepLoopGroup(repeatStep);
  assert.ok(loopGroup);
  const model = buildLoopTraceModuleModel(
    repeatStep,
    loopGroup,
    events,
    false,
    null,
  );
  assert.equal(model.config.count, 3);
  assert.equal(model.config.repeatDelayMs, 120);
  assert.equal(model.iterations.length, 2);
  assert.equal(model.iterations[0]?.stepSummary, "0 步");

  const rows = buildActionTraceTimelineRows(events, false);
  const setupRows = collectRepeatSetupRows(rows, repeatStep, loopGroup.start);
  assert.equal(setupRows.length, 2);
  assert.ok(setupRows.some((row) => row.label.includes("count")));
});
