import assert from "node:assert/strict";
import test from "node:test";
import type { ActionTraceEvent } from "./action-trace-format";
import { parseLoopIterationIndex } from "./action-trace-loop-module-model";
import {
  buildTimelineDisplayItems,
  parseTraceBlocks,
} from "./action-trace-timeline-collapse";
import { buildActionTraceTimelineRows } from "./action-trace-timeline-model";

function buildRepeatIterationEvents(index: number, depth: number): ActionTraceEvent[] {
  const stepIdExpr = `s-2-${index}`;
  const stepIdAssign = `s-3-${index}`;
  return [
    { kind: "repeat_begin", depth, note: `第 ${index} 次循环。` },
    { kind: "group_begin", depth: depth + 1, message: "children=2" },
    {
      kind: "step_begin",
      depth: depth + 2,
      stepId: stepIdExpr,
      stepRunnerName: "执行表达式",
    },
    {
      kind: "input",
      depth: depth + 3,
      paramKey: "expression",
      paramValue: `iter#${index}`,
    },
    {
      kind: "output",
      depth: depth + 3,
      paramKey: "result",
      paramValue: `iter#${index}`,
    },
    { kind: "step_end", depth: depth + 2, stepId: stepIdExpr },
    {
      kind: "step_begin",
      depth: depth + 2,
      stepId: stepIdAssign,
      stepRunnerName: "赋值",
    },
    {
      kind: "input",
      depth: depth + 3,
      paramKey: "input",
      paramValue: `iter#${index}`,
    },
    {
      kind: "output",
      depth: depth + 3,
      paramKey: "output",
      varName: "lastCount",
      paramValue: `iter#${index}`,
    },
    { kind: "step_end", depth: depth + 2, stepId: stepIdAssign },
    { kind: "group_end", depth: depth + 1 },
    { kind: "repeat_end", depth },
  ];
}

function buildRepeatDemoEvents(iterationCount: number): ActionTraceEvent[] {
  const events: ActionTraceEvent[] = [
    { kind: "file_begin", depth: 0, message: "trace begin" },
    { kind: "info", depth: 0, message: "trace start" },
    { kind: "repeat_begin", depth: 0, note: "动作初始化" },
    { kind: "repeat_end", depth: 0 },
    { kind: "group_begin", depth: 0, message: "children=2" },
    {
      kind: "step_begin",
      depth: 1,
      stepId: "s-1",
      stepRunnerKey: "sys:repeat",
      stepRunnerName: "重复",
    },
    {
      kind: "input",
      depth: 2,
      paramKey: "count",
      paramValue: String(iterationCount),
    },
    { kind: "group_begin", depth: 2, message: "children=2" },
  ];

  for (let index = 0; index < iterationCount; index += 1) {
    events.push(...buildRepeatIterationEvents(index, 3));
  }

  events.push(
    { kind: "group_end", depth: 2 },
    { kind: "step_end", depth: 1, stepId: "s-1" },
    { kind: "group_end", depth: 0 },
    { kind: "file_end", depth: 0, message: "trace end" },
  );
  return events;
}

test("parseLoopIterationIndex reads repeat note", () => {
  assert.equal(parseLoopIterationIndex("第 12 次循环。"), 12);
  assert.equal(parseLoopIterationIndex("动作初始化"), null);
});

test("parseTraceBlocks nests loop iterations under repeat step", () => {
  const events = buildRepeatDemoEvents(3);
  const blocks = parseTraceBlocks(events);
  const file = blocks.find((block) => block.type === "file");
  const repeatStep = file?.children
    .find((block) => block.type === "group")
    ?.children.find((block) => block.type === "step");
  const loopGroup = repeatStep?.children.find((block) => block.type === "group");
  assert.ok(loopGroup);
  assert.equal(loopGroup.children.length, 3);
  assert.equal(loopGroup.children.every((child) => child.type === "repeat"), true);
});

test("buildTimelineDisplayItems uses loop module and hides loop body rows", () => {
  const events = buildRepeatDemoEvents(8);
  const rows = buildActionTraceTimelineRows(events, false);
  const items = buildTimelineDisplayItems(rows, events, false, null);
  const sections = items.filter((item) => item.kind === "repeat-step-section");
  assert.equal(sections.length, 1);
  assert.equal(
    sections[0]?.kind === "repeat-step-section"
      && sections[0].model.loopModule.iterations.length,
    8,
  );

  const repeatRows = items.filter(
    (item) =>
      item.kind === "row"
      && (item.row.kind === "repeat_begin" || item.row.kind === "repeat_end"),
  );
  assert.equal(repeatRows.length, 2);
  assert.ok(items.length < rows.length);
});

test("buildTimelineDisplayItems enables loop module with a single iteration", () => {
  const events = buildRepeatDemoEvents(1);
  const rows = buildActionTraceTimelineRows(events, false);
  const items = buildTimelineDisplayItems(rows, events, false, null);
  assert.equal(
    items.filter((item) => item.kind === "repeat-step-section").length,
    1,
  );
});

test("buildTimelineDisplayItems groups repeat step into one section", () => {
  const events = buildRepeatDemoEvents(3);
  const rows = buildActionTraceTimelineRows(events, false);
  const items = buildTimelineDisplayItems(rows, events, false, null);
  const section = items.find((item) => item.kind === "repeat-step-section");
  assert.ok(section && section.kind === "repeat-step-section");
  assert.equal(section.model.beginRow.label.includes("重复"), true);
  assert.ok(
    section.model.setupRows.some((row) => row.label.includes("count")),
  );
  assert.equal(section.model.loopModule.iterations.length, 3);
  assert.equal(section.model.endRow?.kind, "step_end");

  const looseRepeatRows = items.filter((item) => {
    if (item.kind !== "row") return false;
    return item.row.label.includes("count")
      || (item.row.kind === "step_begin" && item.row.label.includes("重复"));
  });
  assert.equal(looseRepeatRows.length, 0);
});

test("loop module selects last iteration by default when complete", () => {
  const events = buildRepeatDemoEvents(5);
  const rows = buildActionTraceTimelineRows(events, false);
  const items = buildTimelineDisplayItems(rows, events, false, null);
  const section = items.find((item) => item.kind === "repeat-step-section");
  assert.ok(section && section.kind === "repeat-step-section");
  assert.equal(section.model.loopModule.activeIterationIndex, 4);
});
