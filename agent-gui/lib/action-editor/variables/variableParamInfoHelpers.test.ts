import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionVariable } from "@/lib/action-editor/types/common";
import {
  compactInputParamInfo,
  patchInputParamInfo,
} from "./variableParamInfoHelpers";

test("patchInputParamInfo compacts empty info away", () => {
  const variable = ActionVariable.fromPartial({ key: "x", isInput: true });
  const patched = patchInputParamInfo(variable, { multiLine: true });
  assert.equal(patched.inputParamInfo?.multiLine, true);

  const cleared = patchInputParamInfo(patched, { multiLine: false });
  assert.equal(cleared.inputParamInfo, undefined);
});

test("compactInputParamInfo keeps validation pattern", () => {
  const info = compactInputParamInfo({
    inputMethod: 0,
    selectionItems: "",
    onlyUseSelect: false,
    isRequired: false,
    validationPattern: "^\\d+$",
    variableMode: 0,
    textTools: "",
    replaceMode: 0,
    isAdvanced: false,
    allowInput: false,
    multiLine: false,
    visibleExpression: "",
    skipEval: false,
  });
  assert.equal(info?.validationPattern, "^\\d+$");
});
