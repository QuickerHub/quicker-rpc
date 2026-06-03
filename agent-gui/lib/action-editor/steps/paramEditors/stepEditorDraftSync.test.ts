import assert from "node:assert/strict";
import test from "node:test";
import type { ActionStep } from "@/lib/action-editor/types/common";
import type { StepRunnerItem } from "@/lib/action-editor/types/action_query";
import {
  buildStepEditorDraft,
  inferControlFieldKeyFromStep,
  mergeRunnerSchemaIntoStepDraft,
  runnerSchemaFingerprint,
  stepEditorDraftFingerprint,
} from "./stepEditorDraftSync";

const baseStep: ActionStep = {
  stepId: "s1",
  stepRunnerKey: "sys:clipboard",
  inputParams: {
    operation: { varKey: "", value: "read" },
  },
  outputParams: {},
};

test("mergeRunnerSchemaIntoStepDraft keeps control field edits when schema expands", () => {
  const draft: ActionStep = {
    ...baseStep,
    inputParams: {
      operation: { varKey: "", value: "write" },
    },
  };
  const schemaA: StepRunnerItem = {
    key: "sys:clipboard",
    inputParamDefs: [
      { key: "operation", name: "操作类型", varType: 3, selectionItems: [{ value: "read" }, { value: "write" }] },
    ],
  };
  const schemaB: StepRunnerItem = {
    key: "sys:clipboard",
    inputParamDefs: [
      { key: "operation", name: "操作类型", varType: 3, selectionItems: [{ value: "read" }, { value: "write" }] },
      { key: "format", name: "格式", varType: 0, defaultValue: "text" },
    ],
  };

  assert.notEqual(runnerSchemaFingerprint(schemaA), runnerSchemaFingerprint(schemaB));

  const merged = mergeRunnerSchemaIntoStepDraft(draft, schemaB);
  assert.equal(merged.inputParams.operation?.value, "write");
  assert.equal(merged.inputParams.format?.value, "text");
});

test("buildStepEditorDraft resets from external step", () => {
  const external: ActionStep = {
    ...baseStep,
    inputParams: { operation: { varKey: "", value: "read" } },
  };
  const built = buildStepEditorDraft(external, {
    key: "sys:clipboard",
    inputParamDefs: [{ key: "operation", name: "操作类型", varType: 3 }],
  });
  assert.equal(built.inputParams.operation?.value, "read");
  assert.equal(stepEditorDraftFingerprint(built), stepEditorDraftFingerprint(external));
});

test("inferControlFieldKeyFromStep prefers key with literal value", () => {
  assert.equal(
    inferControlFieldKeyFromStep(
      {
        stepId: "s1",
        stepRunnerKey: "sys:stop",
        inputParams: {
          operation: { varKey: "", value: "" },
          type: { varKey: "", value: "forcestop" },
        },
        outputParams: {},
      },
      { key: "sys:stop", inputParamDefs: [{ key: "type", isControlField: true, varType: 3 }] },
    ),
    "type",
  );
});

test("inferControlFieldKeyFromStep uses runner control field when present on step", () => {
  assert.equal(
    inferControlFieldKeyFromStep(
      {
        stepId: "s1",
        stepRunnerKey: "sys:clipboard",
        inputParams: { operation: { varKey: "", value: "read" } },
        outputParams: {},
      },
      { key: "sys:clipboard", inputParamDefs: [{ key: "operation", isControlField: true, varType: 3 }] },
    ),
    "operation",
  );
});
