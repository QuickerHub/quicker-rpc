import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionStep } from "@/lib/action-editor/types/common";
import { buildActionStepNodeView } from "@/lib/action-editor/steps/actionStepNodeView";
import { buildClientStepSummary } from "@/lib/action-editor/steps/stepSummaryFallback";
import { collectStepRunnerKeysFromSteps } from "@/lib/action-editor/steps/stepRunnerCatalog";

test("buildClientStepSummary reads csscript script param", () => {
  const step = ActionStep.fromPartial({
    stepRunnerKey: "sys:csscript",
    inputParams: {
      script: { value: "return 1 + 1;" },
    },
  });
  assert.equal(buildClientStepSummary(step), "return 1 + 1;");
});

test("buildActionStepNodeView humanizes missing catalog entry", () => {
  const step = ActionStep.fromPartial({ stepRunnerKey: "sys:csscript" });
  const view = buildActionStepNodeView(step, undefined);
  assert.equal(view.runnerName, "Csscript");
});

test("collectStepRunnerKeysFromSteps walks branches", () => {
  const steps = [
    ActionStep.fromPartial({
      stepRunnerKey: "if",
      ifSteps: [ActionStep.fromPartial({ stepRunnerKey: "sys:csscript" })],
    }),
    ActionStep.fromPartial({ stepRunnerKey: "delay" }),
  ];
  assert.deepEqual(collectStepRunnerKeysFromSteps(steps).sort(), ["delay", "if", "sys:csscript"]);
});
