import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mapAgentSchemaToStepRunnerItem,
  parseAgentValueType,
  resolveStepControlFieldLiteral,
} from "./stepRunnerSchemaMap";
import { CsVarType, ParamVariableMode } from "@/lib/action-editor/steps/paramEditors/csStepEnums";

test("parseAgentValueType maps qkrpc labels", () => {
  assert.equal(parseAgentValueType("Boolean"), CsVarType.Boolean);
  assert.equal(parseAgentValueType("Any"), CsVarType.Any);
  assert.equal(parseAgentValueType("Enum"), CsVarType.Enum);
});

test("mapAgentSchemaToStepRunnerItem maps inputs and outputs", () => {
  const item = mapAgentSchemaToStepRunnerItem({
    stepRunnerKey: "sys:assign",
    name: "赋值",
    inputs: [
      { key: "input", title: "输入", purpose: "content", valueType: "Any", required: true },
      { key: "stopIfFail", title: "失败后停止", valueType: "Boolean", default: "true" },
    ],
    outputs: [{ key: "output", title: "输出", valueType: "Any" }],
  });

  assert.equal(item.key, "sys:assign");
  assert.equal(item.inputParamDefs.length, 2);
  assert.equal(item.inputParamDefs[0]?.name, "输入");
  assert.equal(item.inputParamDefs[0]?.varType, CsVarType.Any);
  assert.equal(item.inputParamDefs[0]?.variableMode, ParamVariableMode.UseVarOrInput);
  assert.equal(item.inputParamDefs[1]?.varType, CsVarType.Boolean);
  assert.equal(item.outputParamDefs.length, 1);
});

test("mapAgentSchemaToStepRunnerItem maps simpleIf condition as var-or-value", () => {
  const item = mapAgentSchemaToStepRunnerItem({
    stepRunnerKey: "sys:simpleIf",
    name: "如果",
    inputs: [{ key: "condition", title: "如果", valueType: "Boolean" }],
    outputs: [],
  });
  assert.equal(item.inputParamDefs[0]?.variableMode, ParamVariableMode.UseVarOrInput);
});

test("mapAgentSchemaToStepRunnerItem merges controlField selection into type enum", () => {
  const item = mapAgentSchemaToStepRunnerItem({
    stepRunnerKey: "sys:windowOperations",
    name: "窗口操作",
    controlField: {
      key: "type",
      selection: [
        {
          key: "move",
          name: "移动窗口",
          visibleInputKeys: ["type", "x", "y"],
        },
        {
          key: "move_ex",
          name: "移动窗口(增强)",
          visibleInputKeys: ["type", "area"],
          visibleOutputKeys: ["result"],
        },
      ],
    },
    inputs: [
      { key: "type", title: "类型", valueType: "Enum", default: "move" },
      { key: "x", title: "X", valueType: "Number" },
      { key: "area", title: "区域", valueType: "Text" },
    ],
    outputs: [{ key: "result", title: "结果", valueType: "Boolean" }],
  });
  const typeDef = item.inputParamDefs.find((d) => d.key === "type");
  assert.equal(typeDef?.isControlField, true);
  assert.equal(typeDef?.selectionItems?.length, 2);
  assert.equal(typeDef?.selectionItems?.[0]?.value, "move");
  const xDef = item.inputParamDefs.find((d) => d.key === "x");
  const areaDef = item.inputParamDefs.find((d) => d.key === "area");
  assert.deepEqual(xDef?.validForList, ["move"]);
  assert.deepEqual(areaDef?.validForList, ["move_ex"]);
  const resultDef = item.outputParamDefs.find((d) => d.key === "result");
  assert.deepEqual(resultDef?.validForList, ["move_ex"]);
});

test("resolveStepControlFieldLiteral reads literal control value", () => {
  const v = resolveStepControlFieldLiteral(
    { inputParams: { type: { value: "move_ex", varKey: "" } } },
    "type"
  );
  assert.equal(v, "move_ex");
});

test("mapAgentSchemaToStepRunnerItem marks reference DLL input as multiline", () => {
  const item = mapAgentSchemaToStepRunnerItem({
    stepRunnerKey: "sys:csscript",
    name: "运行C#代码",
    inputs: [
      {
        key: "reference",
        title: "引用DLL库",
        purpose: "要引用的DLL文件，每行一个。",
        valueType: "Text",
      },
    ],
    outputs: [],
  });
  const reference = item.inputParamDefs.find((d) => d.key === "reference");
  assert.equal(reference?.isMultiLine, true);
});
