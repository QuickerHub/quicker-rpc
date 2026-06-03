import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionStep } from "@/lib/action-editor/types/common";
import type { StepRunnerItem } from "@/lib/action-editor/types/action_query";
import { CsVarType } from "@/lib/action-editor/steps/paramEditors/csStepEnums";
import { buildClientStepSummary } from "@/lib/action-editor/steps/stepSummaryFallback";
import {
  buildSummaryFromParts,
  parseParamDisplayPart,
} from "@/lib/action-editor/steps/stepSummaryFromParts";

test("parseParamDisplayPart handles direct value and length suffix", () => {
  assert.deepEqual(parseParamDisplayPart("formatString!"), {
    propertyName: "formatString",
    useDirectValue: true,
    limitLength: null,
  });
  assert.deepEqual(parseParamDisplayPart("input:60"), {
    propertyName: "input",
    useDirectValue: false,
    limitLength: 60,
  });
});

test("buildSummaryFromParts renders StepSummary template like Quicker delay", () => {
  const runnerItem: StepRunnerItem = {
    key: "sys:delay",
    name: "等待时间",
    description: "",
    icon: "",
    category: "",
    secondaryCategories: [],
    keywords: [],
    supportedParams: [],
    subItems: [],
    stepType: "Action",
    inputParamDefs: [
      {
        key: "delayMs",
        name: "等待时间",
        description: "",
        varType: CsVarType.Integer,
        variableMode: 0,
        isMultiLine: false,
        isRequired: true,
        validationPattern: "",
        selectionItems: [],
        isControlField: false,
        defaultValue: "100",
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
      },
    ],
    outputParamDefs: [],
  };
  const step = ActionStep.fromPartial({
    stepRunnerKey: "sys:delay",
    inputParams: {
      delayMs: { value: "1500" },
    },
  });

  assert.equal(
    buildClientStepSummary(step, runnerItem),
    "等待 1500 ms",
  );
});

test("buildSummaryFromParts keeps literal text and resolves enum display names", () => {
  const step = ActionStep.fromPartial({
    stepRunnerKey: "sys:writeClipboard",
    inputParams: {
      type: { value: "text" },
    },
  });
  const summary = buildSummaryFromParts(
    ["type", " => 剪贴板"],
    step,
    [
      {
        key: "type",
        name: "类型",
        description: "",
        varType: CsVarType.Enum,
        variableMode: 0,
        isMultiLine: false,
        isRequired: true,
        validationPattern: "",
        selectionItems: [{ value: "text", name: "文本", description: "" }],
        isControlField: true,
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
      },
    ],
  );
  assert.equal(summary, "文本 => 剪贴板");
});

test("buildSummaryFromParts resolves param keys that differ from C# property names", () => {
  const step = ActionStep.fromPartial({
    stepRunnerKey: "sys:fileToClipboard",
    inputParams: {
      list: { varKey: "files" },
    },
  });
  const summary = buildSummaryFromParts(
    ["list", " => 剪贴板"],
    step,
    [
      {
        key: "list",
        name: "文件列表",
        description: "",
        varType: CsVarType.List,
        variableMode: 0,
        isMultiLine: true,
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
      },
    ],
  );
  assert.equal(summary, "{files} => 剪贴板");
});

test("buildSummaryFromParts shows externalized file param path", () => {
  const step = ActionStep.fromPartial({
    stepRunnerKey: "sys:csscript",
    inputParams: {
      script: { value: "", file: "files/csscript1.cs" },
    },
  });
  const summary = buildSummaryFromParts(
    ["script:60"],
    step,
    [
      {
        key: "script",
        name: "脚本",
        description: "",
        varType: CsVarType.Text,
        variableMode: 0,
        isMultiLine: true,
        isRequired: true,
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
      },
    ],
  );
  assert.equal(summary, "files/csscript1.cs");
});

test("buildSummaryFromParts resolves assign without runner schema defs", () => {
  const step = ActionStep.fromPartial({
    stepRunnerKey: "sys:assign",
    inputParams: {
      input: { varKey: "capSwitch" },
    },
    outputParams: {
      output: "capType",
    },
  });
  assert.equal(
    buildSummaryFromParts(["input:60", " => ", "output"], step, [], []),
    "{capSwitch} => {capType}",
  );
});

test("buildClientStepSummary resolves assign step from wire keys", () => {
  const runnerItem: StepRunnerItem = {
    key: "sys:assign",
    name: "赋值",
    description: "",
    icon: "",
    category: "",
    secondaryCategories: [],
    keywords: [],
    supportedParams: [],
    subItems: [],
    stepType: "Action",
    inputParamDefs: [
      {
        key: "input",
        name: "输入",
        description: "",
        varType: CsVarType.Any,
        variableMode: 0,
        isMultiLine: true,
        isRequired: true,
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
      },
    ],
    outputParamDefs: [
      {
        key: "output",
        name: "输出",
        description: "",
        varType: CsVarType.Any,
        isAdvanced: false,
        visibleExpression: "",
        customTypeName: "",
        skipLogContent: false,
        validForList: [],
        invalidForList: [],
      },
    ],
  };
  const step = ActionStep.fromPartial({
    stepRunnerKey: "sys:assign",
    inputParams: {
      input: { varKey: "capSwitch" },
    },
    outputParams: {
      output: "capType",
    },
  });
  assert.equal(buildClientStepSummary(step, runnerItem), "{capSwitch} => {capType}");
});

test("buildClientStepSummary resolves assign without runner catalog item", () => {
  const step = ActionStep.fromPartial({
    stepRunnerKey: "sys:assign",
    inputParams: {
      input: { varKey: "capSwitch" },
    },
    outputParams: {
      output: "capType",
    },
  });
  assert.equal(buildClientStepSummary(step, undefined), "{capSwitch} => {capType}");
});

test("buildClientStepSummary reads csscript script param without runner schema", () => {
  const step = ActionStep.fromPartial({
    stepRunnerKey: "sys:csscript",
    inputParams: {
      script: { value: "return 1 + 1;" },
    },
  });
  assert.equal(buildClientStepSummary(step), "return 1 + 1;");
});
