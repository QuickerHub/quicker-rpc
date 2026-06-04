import assert from "node:assert/strict";
import test from "node:test";
import { mapSubprogramCompressedVariables } from "./subprogramIoWire";

test("mapSubprogramCompressedVariables preserves paramName and inputParamInfo", () => {
  const { inputs, outputs } = mapSubprogramCompressedVariables([
    {
      key: "cmd",
      isInput: true,
      paramName: "命令行",
      inputParamInfo: { multiLine: true, isRequired: true },
    },
    {
      key: "handleActionParam",
      isOutput: true,
      paramName: "动作参数句柄",
    },
  ]);

  assert.equal(inputs.length, 1);
  assert.equal(inputs[0]?.key, "cmd");
  assert.equal(inputs[0]?.paramName, "命令行");
  assert.equal(inputs[0]?.inputParamInfo?.multiLine, true);

  assert.equal(outputs.length, 1);
  assert.equal(outputs[0]?.key, "handleActionParam");
  assert.equal(outputs[0]?.paramName, "动作参数句柄");
});

test("mapSubprogramCompressedVariables duplicates input+output rows like Designer IO", () => {
  const { inputs, outputs } = mapSubprogramCompressedVariables([
    { key: "x", isInput: true, isOutput: true, paramName: "双向" },
  ]);
  assert.equal(inputs.length, 1);
  assert.equal(outputs.length, 1);
  assert.equal(outputs[0]?.paramName, "双向");
  assert.notEqual(inputs[0], outputs[0]);
});
