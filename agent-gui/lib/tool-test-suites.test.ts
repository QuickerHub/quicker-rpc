import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chatOnlyToolIds,
  computeToolTestCoverage,
  listExecutableToolIds,
  TOOL_TEST_MANUAL_TOOLS,
  TOOL_TEST_UI_ONLY_TOOLS,
} from "@/lib/tool-test-coverage";
import {
  TOOL_TEST_SUITE_GROUPS,
  TOOL_TEST_SUITES,
  toolTestSuitesForGroup,
} from "@/lib/tool-test-suites";

test("every suite step references a known executable tool", () => {
  const known = new Set([
    ...listExecutableToolIds(),
    ...chatOnlyToolIds(),
    ...TOOL_TEST_UI_ONLY_TOOLS,
  ]);
  for (const suite of TOOL_TEST_SUITES) {
    for (const step of suite.steps) {
      assert.ok(
        known.has(step.toolName),
        `${suite.id}/${step.id}: unknown tool ${step.toolName}`,
      );
    }
  }
});

test("suite and step ids are unique", () => {
  const suiteIds = new Set<string>();
  const stepKeys = new Set<string>();
  for (const suite of TOOL_TEST_SUITES) {
    assert.ok(!suiteIds.has(suite.id), `duplicate suite id ${suite.id}`);
    suiteIds.add(suite.id);
    for (const step of suite.steps) {
      const key = `${suite.id}:${step.id}`;
      assert.ok(!stepKeys.has(key), `duplicate step ${key}`);
      stepKeys.add(key);
    }
  }
});

test("every suite has a valid group", () => {
  const groupIds = new Set(TOOL_TEST_SUITE_GROUPS.map((g) => g.id));
  for (const suite of TOOL_TEST_SUITES) {
    assert.ok(groupIds.has(suite.group), `${suite.id} group ${suite.group}`);
    assert.equal(
      toolTestSuitesForGroup(suite.group).some((s) => s.id === suite.id),
      true,
    );
  }
});

test("automated coverage reaches all automatable tools", () => {
  const report = computeToolTestCoverage();
  assert.deepEqual(
    report.uncoveredToolIds,
    [],
    `uncovered automatable tools: ${report.uncoveredToolIds.join(", ")}`,
  );
  assert.equal(report.ratio, 1);
});
