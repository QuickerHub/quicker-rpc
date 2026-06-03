import assert from "node:assert/strict";
import { test } from "node:test";
import type { ActionStep } from "@/lib/action-editor/types/common";
import { buildActionStepNodeView, inferBranches, normalizeStepRunnerKeyTail } from "./actionStepNodeView";

test("normalizeStepRunnerKeyTail strips sys: prefix", () => {
  assert.equal(normalizeStepRunnerKeyTail("sys:simpleIf"), "simpleif");
  assert.equal(normalizeStepRunnerKeyTail("sys:group"), "group");
});

test("inferBranches uses stepType when present", () => {
  assert.deepEqual(inferBranches("sys:anything", "Loop"), { hasIfBranch: true, hasElseBranch: false });
  assert.deepEqual(inferBranches("sys:anything", "If"), { hasIfBranch: true, hasElseBranch: true });
});

test("inferBranches infers from runner key when stepType is empty", () => {
  assert.deepEqual(inferBranches("sys:simpleIf", ""), { hasIfBranch: true, hasElseBranch: false });
  assert.deepEqual(inferBranches("sys:if", ""), { hasIfBranch: true, hasElseBranch: true });
  assert.deepEqual(inferBranches("sys:group", ""), { hasIfBranch: true, hasElseBranch: false });
  assert.deepEqual(inferBranches("sys:assign", ""), { hasIfBranch: false, hasElseBranch: false });
});

test("buildActionStepNodeView shows branch box for nested simpleIf without catalog stepType", () => {
  const step: ActionStep = {
    stepRunnerKey: "sys:simpleIf",
    inputParams: {},
    outputParams: {},
    ifSteps: [],
    elseSteps: [],
    stepId: "s-1"
  };
  const view = buildActionStepNodeView(step, undefined);
  assert.equal(view.hasIfBranch, true);
  assert.equal(view.hasElseBranch, false);
});
