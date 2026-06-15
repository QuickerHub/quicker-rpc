import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { resolveNodePath } from "@/lib/action-editor/program/resolveNodePath";
import {
  computeProgramStepDiskSlice,
  hashProgramStepContent,
} from "@/lib/action-editor/program/stepDiskSlice";
import type { ActionStep } from "@/lib/action-editor/types/common";

const sampleDataJson = readFileSync(
  join(
    process.cwd(),
    "..",
    ".quicker",
    "actions",
    "655a4ed4-37cb-41e9-bb75-782ca07d45a3",
    "data.json",
  ),
  "utf8",
);

test("resolveNodePath finds root step index", () => {
  const steps: ActionStep[] = [
    { stepId: "s-0", stepRunnerKey: "sys:a" },
    { stepId: "s-1", stepRunnerKey: "sys:b" },
  ];
  assert.equal(resolveNodePath(steps, "s-1"), "1");
});

test("resolveNodePath finds nested if branch step", () => {
  const steps: ActionStep[] = [
    {
      stepId: "s-0",
      stepRunnerKey: "sys:if",
      ifSteps: [{ stepId: "s-0-0", stepRunnerKey: "sys:inner" }],
    },
  ];
  assert.equal(resolveNodePath(steps, "s-0-0"), "0/if/0");
});

test("computeProgramStepDiskSlice extracts step 1 from fixture data.json", () => {
  const slice = computeProgramStepDiskSlice(sampleDataJson, "1");
  assert.equal(slice.ok, true);
  if (!slice.ok) return;
  assert.match(slice.slice.content, /"stepRunnerKey": "sys:MsgBox"/);
  assert.match(slice.slice.content, /弹窗显示过滤后的键列表/);
  assert.equal(slice.slice.startLine, 10);
  assert.equal(slice.slice.endLine, 20);
  assert.equal(slice.slice.contentHash, hashProgramStepContent(slice.slice.content));
});

test("computeProgramStepDiskSlice roundtrip content is valid JSON object", () => {
  const slice = computeProgramStepDiskSlice(sampleDataJson, "0");
  assert.equal(slice.ok, true);
  if (!slice.ok) return;
  const parsed = JSON.parse(slice.slice.content) as Record<string, unknown>;
  assert.equal(parsed.stepRunnerKey, "sys:evalexpression");
});

test("computeProgramStepDiskSlice fails for out-of-range index", () => {
  const slice = computeProgramStepDiskSlice(sampleDataJson, "99");
  assert.equal(slice.ok, false);
});
