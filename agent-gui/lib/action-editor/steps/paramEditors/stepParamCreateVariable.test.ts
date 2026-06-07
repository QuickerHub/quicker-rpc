import { describe, expect, it } from "vitest";
import { ActionVariable } from "@/lib/action-editor/types/common";
import { CsVarType } from "./csStepEnums";
import {
  isValidActionVariableKey,
  normalizeParamNameForVariable,
  resolveCreateVariableTargetType,
  suggestVariableKeyFromParam,
} from "./stepParamCreateVariable";

describe("stepParamCreateVariable", () => {
  it("normalizes var: prefix and invalid identifiers", () => {
    expect(normalizeParamNameForVariable("var:foo")).toBe("foo");
    expect(normalizeParamNameForVariable("bad-name")).toBe("_bad-name");
  });

  it("resolves enum target type to text", () => {
    expect(resolveCreateVariableTargetType(CsVarType.Enum)).toBe(CsVarType.Text);
    expect(resolveCreateVariableTargetType(CsVarType.Integer)).toBe(CsVarType.Integer);
  });

  it("validates csharp-like variable keys", () => {
    expect(isValidActionVariableKey("foo_1")).toBe(true);
    expect(isValidActionVariableKey("params")).toBe(true);
    expect(isValidActionVariableKey("1bad")).toBe(false);
    expect(isValidActionVariableKey("class")).toBe(false);
  });

  it("suggests unused keys from param names", () => {
    const existing = [
      ActionVariable.create({ id: "1", key: "result", varType: CsVarType.Text }),
    ];
    expect(suggestVariableKeyFromParam("result", existing)).not.toBe("result");
    expect(suggestVariableKeyFromParam("myParam", existing)).toBe("myParam");
  });
});
