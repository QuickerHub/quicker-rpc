import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ActionVariable } from "@/lib/action-editor/types/common";
import { CsVarType } from "./csStepEnums";
import {
  isValidActionVariableKey,
  normalizeParamNameForVariable,
  resolveCreateVariableTargetType,
  suggestVariableKeyFromParam,
} from "./stepParamCreateVariable";

describe("stepParamCreateVariable", () => {
  test("normalizes var: prefix and invalid identifiers", () => {
    assert.equal(normalizeParamNameForVariable("var:foo"), "foo");
    assert.equal(normalizeParamNameForVariable("bad-name"), "_bad-name");
  });

  test("resolves enum target type to text", () => {
    assert.equal(resolveCreateVariableTargetType(CsVarType.Enum), CsVarType.Text);
    assert.equal(resolveCreateVariableTargetType(CsVarType.Integer), CsVarType.Integer);
  });

  test("validates csharp-like variable keys", () => {
    assert.equal(isValidActionVariableKey("foo_1"), true);
    assert.equal(isValidActionVariableKey("params"), true);
    assert.equal(isValidActionVariableKey("1bad"), false);
    assert.equal(isValidActionVariableKey("class"), false);
  });

  test("suggests unused keys from param names", () => {
    const existing = [
      ActionVariable.create({ id: "1", key: "result", varType: CsVarType.Text }),
    ];
    assert.notEqual(suggestVariableKeyFromParam("result", existing), "result");
    assert.equal(suggestVariableKeyFromParam("myParam", existing), "myParam");
  });
});
