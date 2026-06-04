import assert from "node:assert/strict";
import { test } from "node:test";
import { CsVarType } from "@/lib/action-editor/steps/paramEditors/csStepEnums";
import {
  inferStepParamMultiline,
  resolveStepParamMultiline,
} from "@/lib/action-editor/steps/paramEditors/stepParamMultiline";
import type { StepRunnerInputParamDef } from "@/lib/action-editor/types/action_query";

function textParam(key: string, overrides: Partial<StepRunnerInputParamDef> = {}): StepRunnerInputParamDef {
  return {
    key,
    name: key,
    description: "",
    varType: CsVarType.Text,
    variableMode: 0,
    isMultiLine: false,
    isRequired: false,
    validationPattern: "",
    selectionItems: [],
    isControlField: false,
    defaultValue: "",
    fromOldField: "",
    isAdvanced: false,
    allowInput: true,
    visibleExpression: "",
    replaceVariable: false,
    defaultHighlightType: "",
    skipEval: false,
    skipLogContent: false,
    validForList: [],
    invalidForList: [],
    ...overrides,
  };
}

test("resolveStepParamMultiline enables script key without catalog isMultiLine", () => {
  assert.equal(resolveStepParamMultiline(textParam("script")), true);
});

test("resolveStepParamMultiline enables external files/*.cs", () => {
  assert.equal(
    resolveStepParamMultiline(textParam("code"), { varKey: "", value: "", file: "files/wait-clipboard-log.cs" }),
    true,
  );
});

test("resolveStepParamMultiline enables reference DLL field from description", () => {
  assert.equal(
    resolveStepParamMultiline(
      textParam("reference", { description: "要引用的DLL文件，每行一个。" }),
    ),
    true,
  );
});

test("inferStepParamMultiline enables multiline defaultValue", () => {
  assert.equal(
    inferStepParamMultiline({
      key: "script",
      description: "",
      defaultValue: "line1\nline2",
      varType: CsVarType.Text,
    }),
    true,
  );
});

test("inferStepParamMultiline enables stored multiline value", () => {
  assert.equal(
    inferStepParamMultiline({
      key: "reference",
      description: "",
      defaultValue: "",
      varType: CsVarType.Text,
      param: { varKey: "", value: "a.dll\nb.dll" },
    }),
    true,
  );
});

test("resolveStepParamMultiline keeps short inline text params", () => {
  assert.equal(
    resolveStepParamMultiline(textParam("message"), { varKey: "", value: "hello" }),
    false,
  );
});
