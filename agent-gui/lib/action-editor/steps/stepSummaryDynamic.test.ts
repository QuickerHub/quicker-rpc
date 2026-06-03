import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionStep } from "@/lib/action-editor/types/common";
import type { StepRunnerItem } from "@/lib/action-editor/types/action_query";
import { CsVarType } from "@/lib/action-editor/steps/paramEditors/csStepEnums";
import {
  buildExcelReadWriteStepSummary,
  buildGroupStepSummary,
  buildPathExtractionStepSummary,
} from "@/lib/action-editor/steps/stepSummaryDynamic";
import { buildClientStepSummary } from "@/lib/action-editor/steps/stepSummaryFallback";

function enumInput(key: string, value: string, name: string, isControlField = false) {
  return {
    key,
    name: key,
    description: "",
    varType: CsVarType.Enum,
    variableMode: 0,
    isMultiLine: false,
    isRequired: true,
    validationPattern: "",
    selectionItems: [{ value, name, description: "" }],
    isControlField,
    defaultValue: value,
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
  };
}

test("buildGroupStepSummary mirrors Quicker flags", () => {
  const runnerItem: StepRunnerItem = {
    key: "sys:group",
    name: "步骤组",
    description: "",
    icon: "",
    category: "",
    secondaryCategories: [],
    keywords: [],
    supportedParams: [],
    subItems: [],
    stepType: "Group",
    inputParamDefs: [
      {
        key: "useMultiThread",
        name: "多线程",
        description: "",
        varType: CsVarType.Boolean,
        variableMode: 0,
        isMultiLine: false,
        isRequired: false,
        validationPattern: "",
        selectionItems: [],
        isControlField: false,
        defaultValue: "false",
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
      {
        key: "skipErr",
        name: "忽略错误",
        description: "",
        varType: CsVarType.Boolean,
        variableMode: 0,
        isMultiLine: false,
        isRequired: false,
        validationPattern: "",
        selectionItems: [],
        isControlField: false,
        defaultValue: "false",
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
      {
        key: "skipWhenDebugging",
        name: "忽略调试",
        description: "",
        varType: CsVarType.Boolean,
        variableMode: 0,
        isMultiLine: false,
        isRequired: false,
        validationPattern: "",
        selectionItems: [],
        isControlField: false,
        defaultValue: "true",
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
    stepRunnerKey: "sys:group",
    inputParams: {
      useMultiThread: { value: "true" },
      skipErr: { value: "1" },
      skipWhenDebugging: { value: "true" },
    },
  });
  assert.equal(
    buildGroupStepSummary(step, runnerItem),
    "【多线程】 【忽略错误】 【忽略调试输出】",
  );
});

test("buildPathExtractionStepSummary switches on operation", () => {
  const runnerItem: StepRunnerItem = {
    key: "sys:pathExtraction",
    name: "路径",
    description: "",
    icon: "",
    category: "",
    secondaryCategories: [],
    keywords: [],
    supportedParams: [],
    subItems: [],
    stepType: "Action",
    inputParamDefs: [
      enumInput("operation", "changeExt", "改扩展名", true),
      {
        key: "path",
        name: "路径",
        description: "",
        varType: CsVarType.Text,
        variableMode: 0,
        isMultiLine: false,
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
      {
        key: "newExtension",
        name: "新扩展名",
        description: "",
        varType: CsVarType.Text,
        variableMode: 0,
        isMultiLine: false,
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
    outputParamDefs: [],
  };
  const step = ActionStep.fromPartial({
    stepRunnerKey: "sys:pathExtraction",
    inputParams: {
      operation: { value: "changeExt" },
      path: { value: "C:\\a.txt" },
      newExtension: { value: ".md" },
    },
  });
  assert.equal(
    buildPathExtractionStepSummary(step, runnerItem),
    "改扩展名 C:\\a.txt => .md",
  );
});

test("buildExcelReadWriteStepSummary prefixes operation display", () => {
  const runnerItem: StepRunnerItem = {
    key: "sys:excelreadwrite",
    name: "Excel",
    description: "",
    icon: "",
    category: "",
    secondaryCategories: [],
    keywords: [],
    supportedParams: [],
    subItems: [],
    stepType: "Action",
    inputParamDefs: [
      enumInput("operation", "load", "加载", true),
      {
        key: "filePath",
        name: "路径",
        description: "",
        varType: CsVarType.Text,
        variableMode: 0,
        isMultiLine: false,
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
    outputParamDefs: [],
  };
  const step = ActionStep.fromPartial({
    stepRunnerKey: "sys:excelreadwrite",
    inputParams: {
      operation: { value: "load" },
      filePath: { value: "book.xlsx" },
    },
  });
  assert.equal(buildExcelReadWriteStepSummary(step, runnerItem), "【加载】book.xlsx");
});

test("buildClientStepSummary uses manual script pattern", () => {
  const runnerItem: StepRunnerItem = {
    key: "sys:csscript",
    name: "C#",
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
    outputParamDefs: [],
  };
  const step = ActionStep.fromPartial({
    stepRunnerKey: "sys:csscript",
    inputParams: { script: { value: "return 1 + 1;" } },
  });
  assert.equal(buildClientStepSummary(step, runnerItem), "return 1 + 1;");
});
