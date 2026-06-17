import assert from "node:assert/strict";
import { test } from "node:test";
import { mapAgentSchemaToStepRunnerItem } from "@/lib/action-editor/api/stepRunnerSchemaMap";
import { ActionStep } from "@/lib/action-editor/types/common";
import { buildClientStepSummary } from "@/lib/action-editor/steps/stepSummaryFallback";
import {
  buildStepParamValuesForVisibility,
  filterRunnerItemDefsForStep,
  isParamDefVisibleForStep,
  stepRunnerSchemaCacheKey,
} from "@/lib/action-editor/steps/stepParamVisibility";

test("stepRunnerSchemaCacheKey includes control literal", () => {
  const step = ActionStep.fromPartial({
    stepRunnerKey: "sys:MsgBox",
    inputParams: {
      operation: { value: "default" },
    },
  });
  assert.equal(stepRunnerSchemaCacheKey(step), "sys:MsgBox\0default");
});

test("filterRunnerItemDefsForStep hides custom-only params in default mode", () => {
  const item = mapAgentSchemaToStepRunnerItem({
    stepRunnerKey: "sys:MsgBox",
    name: "弹窗",
    controlField: {
      key: "operation",
      selection: [
        {
          key: "default",
          name: "标准",
          visibleInputKeys: ["operation", "message", "title", "icon", "buttons"],
        },
        {
          key: "custom",
          name: "自定义",
          visibleInputKeys: ["operation", "message", "customIcon"],
        },
      ],
    },
    inputs: [
      { key: "operation", title: "模式", valueType: "Enum", isControlField: true },
      { key: "message", title: "消息", valueType: "Text" },
      { key: "customIcon", title: "图标", valueType: "Text" },
    ],
    outputs: [],
  });

  const step = ActionStep.fromPartial({
    stepRunnerKey: "sys:MsgBox",
    inputParams: {
      operation: { value: "default" },
      message: { value: "hello" },
      customIcon: { value: "should-hide" },
    },
  });

  const filtered = filterRunnerItemDefsForStep(item, step);
  assert.ok(filtered.inputParamDefs.some((d) => d.key === "message"));
  assert.ok(!filtered.inputParamDefs.some((d) => d.key === "customIcon"));
});

test("buildClientStepSummary for MsgBox uses message only in default mode", () => {
  const item = mapAgentSchemaToStepRunnerItem({
    stepRunnerKey: "sys:MsgBox",
    name: "弹窗",
    controlField: {
      key: "operation",
      selection: [
        {
          key: "default",
          name: "标准",
          visibleInputKeys: ["operation", "message"],
        },
        {
          key: "custom",
          name: "自定义",
          visibleInputKeys: ["operation", "message", "customIcon"],
        },
      ],
    },
    inputs: [
      { key: "operation", title: "模式", valueType: "Enum", isControlField: true },
      { key: "message", title: "消息", valueType: "Text" },
      { key: "customIcon", title: "图标", valueType: "Text" },
    ],
    outputs: [],
  });

  const step = ActionStep.fromPartial({
    stepRunnerKey: "sys:MsgBox",
    inputParams: {
      operation: { value: "default" },
      message: { value: "行数 {lineCount}" },
      customIcon: { value: "hidden" },
    },
  });

  assert.equal(buildClientStepSummary(step, item), "标准 行数 {lineCount}");
});

test("buildStepParamValuesForVisibility prefers varKey over literal value", () => {
  const step = ActionStep.fromPartial({
    inputParams: {
      message: { varKey: "msgVar", value: "ignored" },
      title: { value: "literal" },
    },
  });
  const values = buildStepParamValuesForVisibility(step);
  assert.equal(values.message, "msgVar");
  assert.equal(values.title, "literal");
});

test("isParamDefVisibleForStep shows validFor params when control value is empty", () => {
  const inputDefs = [
    {
      key: "operation",
      visibleExpression: "",
      validForList: [] as string[],
      invalidForList: [] as string[],
      isControlField: true,
      selectionItems: [{ value: "default", name: "标准", description: "" }],
    },
    {
      key: "message",
      visibleExpression: "",
      validForList: ["default"],
      invalidForList: [] as string[],
    },
  ];
  assert.equal(
    isParamDefVisibleForStep(inputDefs[1]!, { operation: "" }, inputDefs as never),
    true,
  );
});

test("isParamDefVisibleForStep uses varKey-bound control value when it matches a mode", () => {
  const inputDefs = [
    {
      key: "operation",
      visibleExpression: "",
      validForList: [] as string[],
      invalidForList: [] as string[],
      isControlField: true,
      selectionItems: [{ value: "custom", name: "自定义", description: "" }],
    },
    {
      key: "customIcon",
      visibleExpression: "",
      validForList: ["custom"],
      invalidForList: [] as string[],
    },
  ];
  const values = { operation: "custom" };
  assert.equal(
    isParamDefVisibleForStep(inputDefs[1]!, values, inputDefs as never),
    true,
  );
});

test("isParamDefVisibleForStep shows all mode params when control is varKey-bound", () => {
  const item = mapAgentSchemaToStepRunnerItem({
    stepRunnerKey: "sys:notify",
    name: "提示消息",
    controlField: {
      key: "style",
      selection: [
        {
          key: "Default",
          name: "默认",
          visibleInputKeys: ["type", "msg", "maxLines", "style", "clickAction"],
        },
        {
          key: "Style2",
          name: "风格2",
          visibleInputKeys: ["type", "msg", "maxLines", "style"],
        },
      ],
    },
    inputs: [
      { key: "type", title: "类型", valueType: "Enum" },
      { key: "msg", title: "消息内容", valueType: "Text" },
      { key: "style", title: "风格", valueType: "Enum", isControlField: true },
    ],
    outputs: [],
  });

  const step = ActionStep.fromPartial({
    stepRunnerKey: "sys:notify",
    inputParams: {
      style: { varKey: "styleVar", value: "Default" },
      msg: { value: "hello" },
    },
  });
  const values = buildStepParamValuesForVisibility(step);
  const inputDefs = item.inputParamDefs ?? [];
  assert.equal(
    isParamDefVisibleForStep(
      inputDefs.find((d) => d.key === "msg")!,
      values,
      inputDefs,
    ),
    true,
  );
});
