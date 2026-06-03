import assert from "node:assert/strict";
import { test } from "node:test";
import type { ActionStep } from "@/lib/action-editor/types/common";
import type { StepRunnerLookup } from "./stepRunnerCatalog";
import {
  applyStepsDropReorder,
  collectVisualStepOrderIds,
  navigateStepSelectionHorizontally,
  unwrapGroupStepsInTree,
  wrapStepsIntoParent
} from "./stepTreeOps";

const lookup: StepRunnerLookup = {
  "sys:simpleIf": { key: "sys:simpleIf", name: "如果", description: "", icon: "", stepType: "" },
  "sys:assign": { key: "sys:assign", name: "赋值", description: "", icon: "", stepType: "" },
  "sys:group": { key: "sys:group", name: "步骤组", description: "", icon: "", stepType: "" }
};

test("collectVisualStepOrderIds skips collapsed branch children", () => {
  const steps: ActionStep[] = [
    {
      stepRunnerKey: "sys:simpleIf",
      inputParams: {},
      outputParams: {},
      ifSteps: [{ stepRunnerKey: "sys:assign", inputParams: {}, outputParams: {}, stepId: "inner" }],
      collapsed: true,
      stepId: "outer"
    },
    { stepRunnerKey: "sys:assign", inputParams: {}, outputParams: {}, stepId: "after" }
  ];
  assert.deepEqual(collectVisualStepOrderIds(steps, lookup), ["outer", "after"]);
});

test("collectVisualStepOrderIds includes expanded branch children", () => {
  const steps: ActionStep[] = [
    {
      stepRunnerKey: "sys:simpleIf",
      inputParams: {},
      outputParams: {},
      ifSteps: [{ stepRunnerKey: "sys:assign", inputParams: {}, outputParams: {}, stepId: "inner" }],
      collapsed: false,
      stepId: "outer"
    }
  ];
  assert.deepEqual(collectVisualStepOrderIds(steps, lookup), ["outer", "inner"]);
});

test("applyStepsDropReorder moves steps into empty if branch", () => {
  const steps: ActionStep[] = [
    {
      stepRunnerKey: "sys:simpleIf",
      inputParams: {},
      outputParams: {},
      ifSteps: [],
      collapsed: false,
      stepId: "if1"
    },
    { stepRunnerKey: "sys:assign", inputParams: {}, outputParams: {}, stepId: "a1" }
  ];
  const next = applyStepsDropReorder(steps, ["a1"], {
    kind: "container",
    parentId: "if1",
    branch: "if"
  });
  assert.deepEqual(next?.[0]?.ifSteps?.map((s) => s.stepId), ["a1"]);
  assert.equal(next?.length, 1);
});

test("wrapStepsIntoParent and unwrapGroupStepsInTree", () => {
  const steps: ActionStep[] = [
    { stepRunnerKey: "sys:assign", inputParams: {}, outputParams: {}, stepId: "a" },
    { stepRunnerKey: "sys:assign", inputParams: {}, outputParams: {}, stepId: "b" }
  ];
  const wrapped = wrapStepsIntoParent(steps, ["a", "b"], {
    stepRunnerKey: "sys:group",
    addToIfSteps: true,
    newStepId: "g1"
  });
  assert.equal(wrapped?.steps.length, 1);
  assert.deepEqual(wrapped?.steps[0]?.ifSteps?.map((s) => s.stepId), ["a", "b"]);

  const unwrapped = unwrapGroupStepsInTree(wrapped!.steps, ["g1"]);
  assert.deepEqual(unwrapped?.steps.map((s) => s.stepId), ["a", "b"]);
});

test("navigateStepSelectionHorizontally expands collapsed branch on ArrowRight", () => {
  const steps: ActionStep[] = [
    {
      stepRunnerKey: "sys:simpleIf",
      inputParams: {},
      outputParams: {},
      ifSteps: [{ stepRunnerKey: "sys:assign", inputParams: {}, outputParams: {}, stepId: "inner" }],
      collapsed: true,
      stepId: "outer"
    }
  ];
  const result = navigateStepSelectionHorizontally(steps, lookup, "outer", 1);
  assert.equal(result.stepsPatch?.[0]?.collapsed, false);
  assert.equal(result.nextSelectedId, "outer");
});

test("navigateStepSelectionHorizontally selects first child when expanded", () => {
  const steps: ActionStep[] = [
    {
      stepRunnerKey: "sys:simpleIf",
      inputParams: {},
      outputParams: {},
      ifSteps: [{ stepRunnerKey: "sys:assign", inputParams: {}, outputParams: {}, stepId: "inner" }],
      collapsed: false,
      stepId: "outer"
    }
  ];
  const result = navigateStepSelectionHorizontally(steps, lookup, "outer", 1);
  assert.equal(result.nextSelectedId, "inner");
});
