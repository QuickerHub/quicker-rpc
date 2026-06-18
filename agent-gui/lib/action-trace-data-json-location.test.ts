import assert from "node:assert/strict";
import test from "node:test";
import type { ActionTraceEvent } from "./action-trace-format";
import {
  buildLocationFromQkrpcFailure,
  buildTraceStepIdToNodePathMap,
  extractTraceFailureContext,
  resolveTraceLocationInDataJson,
  walkDataJsonSteps,
} from "./action-trace-data-json-location";

const SAMPLE_DATA_JSON = JSON.stringify(
  {
    steps: [
      {
        stepRunnerKey: "sys:getClipboardText",
        inputParams: { format: "UnicodeText" },
        outputParams: { output: "clipText" },
      },
      {
        stepRunnerKey: "sys:evalexpression",
        note: "dedupe",
        inputParams: {
          expression:
            "$=string.Join(\"\\r\\n\", @\"{clipText}\".Split(...).Distinct())",
        },
        outputParams: { output: "resultText" },
      },
      {
        stepRunnerKey: "sys:writeClipboard",
        inputParams: { "text.var": "resultText" },
      },
    ],
    variables: [{ key: "clipText" }, { key: "resultText" }],
  },
  null,
  2,
);

test("walkDataJsonSteps traverses if/else branches", () => {
  const steps = walkDataJsonSteps([
    {
      stepRunnerKey: "sys:if",
      ifSteps: [{ stepRunnerKey: "sys:msgbox", stepId: "s-inner" }],
      elseSteps: [{ stepRunnerKey: "sys:delay" }],
    },
  ]);
  assert.deepEqual(steps.map((step) => step.nodePath), ["0", "0/if/0", "0/else/0"]);
  assert.equal(steps[1]?.stepId, "s-inner");
});

test("extractTraceFailureContext finds error step", () => {
  const events: ActionTraceEvent[] = [
    {
      kind: "step_begin",
      stepId: "s-2",
      stepRunnerKey: "sys:evalexpression",
      stepRunnerName: "执行表达式",
    },
    {
      kind: "input",
      paramKey: "expression",
      paramValue: "$=bad",
    },
    {
      kind: "error",
      message: "表达式计算失败",
    },
  ];
  const failure = extractTraceFailureContext(events);
  assert.ok(failure);
  assert.equal(failure!.stepId, "s-2");
  assert.equal(failure!.paramKey, "expression");
  assert.equal(failure!.message, "表达式计算失败");
});

test("buildTraceStepIdToNodePathMap matches by stepRunnerKey sequence", () => {
  const tree = walkDataJsonSteps(JSON.parse(SAMPLE_DATA_JSON).steps);
  const events: ActionTraceEvent[] = [
    { kind: "step_begin", stepId: "runtime-1", stepRunnerKey: "sys:getClipboardText" },
    { kind: "step_begin", stepId: "runtime-2", stepRunnerKey: "sys:evalexpression" },
    { kind: "step_begin", stepId: "runtime-3", stepRunnerKey: "sys:writeClipboard" },
  ];
  const map = buildTraceStepIdToNodePathMap(events, tree);
  assert.equal(map.get("runtime-2"), "1");
});

test("resolveTraceLocationInDataJson maps error to data.json lines", () => {
  const events: ActionTraceEvent[] = [
    { kind: "step_begin", stepId: "s-1", stepRunnerKey: "sys:getClipboardText" },
    { kind: "step_end", stepId: "s-1" },
    {
      kind: "step_begin",
      stepId: "s-2",
      stepRunnerKey: "sys:evalexpression",
      note: "dedupe",
    },
    {
      kind: "input",
      paramKey: "expression",
      paramValue: "$=bad",
    },
    { kind: "error", message: "表达式计算失败" },
  ];

  const location = resolveTraceLocationInDataJson({
    events,
    dataJsonText: SAMPLE_DATA_JSON,
    dataJsonPath: ".quicker/actions/demo/data.json",
    runMeta: { ok: false },
  });

  assert.ok(location);
  assert.equal(location!.nodePath, "1");
  assert.equal(location!.stepRunnerKey, "sys:evalexpression");
  assert.equal(location!.paramName, "expression");
  assert.equal(location!.dataJsonPointer, "steps[1].inputParams.expression");
  assert.equal(location!.matchMethod, "stepRunnerSequence");
  assert.ok((location!.startLine ?? 0) > 0);
  assert.match(location!.locationSummary, /data\.json L/);
});

test("resolveTraceLocationInDataJson prefers stepId on disk", () => {
  const dataJson = JSON.stringify(
    {
      steps: [
        {
          stepId: "s-expr",
          stepRunnerKey: "sys:evalexpression",
          inputParams: { expression: "$=1" },
        },
      ],
    },
    null,
    2,
  );
  const events: ActionTraceEvent[] = [
    {
      kind: "step_begin",
      stepId: "s-expr",
      stepRunnerKey: "sys:evalexpression",
    },
    { kind: "error", message: "boom" },
  ];

  const location = resolveTraceLocationInDataJson({
    events,
    dataJsonText: dataJson,
    dataJsonPath: ".quicker/actions/x/data.json",
  });

  assert.ok(location);
  assert.equal(location!.nodePath, "0");
  assert.equal(location!.matchMethod, "stepId");
});

test("buildLocationFromQkrpcFailure adds line range from authoritative stepPath", () => {
  const location = buildLocationFromQkrpcFailure({
    qkrpcLocation: {
      stepPath: "1",
      stepId: "s-fail",
      stepRunnerKey: "sys:evalexpression",
      paramKey: "expression",
      dataJsonPointer: "steps[1].inputParams.expression",
      matchMethod: "stepId",
    },
    dataJsonText: SAMPLE_DATA_JSON,
    dataJsonPath: ".quicker/actions/demo/data.json",
  });

  assert.ok(location);
  assert.equal(location!.nodePath, "1");
  assert.equal(location!.stepId, "s-fail");
  assert.equal(location!.dataJsonPointer, "steps[1].inputParams.expression");
  assert.equal(location!.matchMethod, "stepId");
  assert.ok((location!.startLine ?? 0) > 0);
  assert.match(location!.locationSummary, /data\.json L/);
});

test("resolveTraceLocationInDataJson uses stepPath from trace events when present", () => {
  const events: ActionTraceEvent[] = [
    {
      kind: "step_begin",
      stepId: "s-inner",
      stepRunnerKey: "sys:evalexpression",
      stepPath: "0/if/0",
    },
    {
      kind: "error",
      stepPath: "0/if/0",
      message: "branch failed",
    },
  ];
  const dataJson = JSON.stringify(
    {
      steps: [
        {
          stepRunnerKey: "sys:if",
          ifSteps: [
            {
              stepId: "s-inner",
              stepRunnerKey: "sys:evalexpression",
              inputParams: { expression: "$=bad" },
            },
          ],
        },
      ],
    },
    null,
    2,
  );

  const location = resolveTraceLocationInDataJson({
    events,
    dataJsonText: dataJson,
    dataJsonPath: ".quicker/actions/branch/data.json",
  });

  assert.ok(location);
  assert.equal(location!.nodePath, "0/if/0");
  assert.equal(location!.stepId, "s-inner");
});
