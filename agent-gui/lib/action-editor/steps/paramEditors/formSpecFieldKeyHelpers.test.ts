import assert from "node:assert/strict";
import { test } from "node:test";
import type { ActionVariable } from "@/lib/action-editor/types/common";
import { CsVarType } from "@/lib/action-editor/steps/paramEditors/csStepEnums";
import {
  buildFormFieldKeyCandidates,
  collectUsedFormFieldKeys,
  patchFormFieldKeyChange,
} from "@/lib/action-editor/steps/paramEditors/formSpecFieldKeyHelpers";

function variable(key: string, varType: number): ActionVariable {
  return { id: key, key, varType, desc: `${key} desc` };
}

test("buildFormFieldKeyCandidates filters by field type and used keys", () => {
  const variables = [
    variable("charset", CsVarType.Text),
    variable("count", CsVarType.Integer),
    variable("flag", CsVarType.Boolean),
  ];
  const used = new Set(["charset"]);
  const candidates = buildFormFieldKeyCandidates(variables, "integer", used);
  assert.deepEqual(candidates.map((item) => item.key), ["count"]);
});

test("patchFormFieldKeyChange syncs target and label from variable", () => {
  const variables = [variable("charset", CsVarType.Text)];
  const patch = patchFormFieldKeyChange(
    { key: "field1", label: "field1", type: "text", target: "field1" },
    "charset",
    variables,
  );
  assert.equal(patch.key, "charset");
  assert.equal(patch.target, "charset");
  assert.equal(patch.label, "charset desc");
});

test("collectUsedFormFieldKeys skips current index", () => {
  const used = collectUsedFormFieldKeys(
    [
      { key: "a", label: "A", type: "text" },
      { key: "b", label: "B", type: "text" },
    ],
    1,
  );
  assert.deepEqual([...used], ["a"]);
});
