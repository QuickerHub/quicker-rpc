import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildEnumSelectionOptions,
  findEnumSelectionItem,
  resolveVarOrValueDisplayMode,
  varOrValueParamAllowsFreeInput,
} from "./stepParamEnumOptions";
import { ParamVariableMode } from "./csStepEnums";

test("buildEnumSelectionOptions appends obsolete row when value missing and allowInput false", () => {
  const items = [{ value: "a", name: "A", description: "" }];
  const out = buildEnumSelectionOptions(items, "legacy", false);
  assert.equal(out.length, 2);
  assert.equal(out[1]?.value, "legacy");
  assert.match(out[1]?.name ?? "", /已过时/);
});

test("buildEnumSelectionOptions skips obsolete row when allowInput true", () => {
  const items = [{ value: "a", name: "A", description: "" }];
  assert.equal(buildEnumSelectionOptions(items, "custom", true).length, 1);
});

test("findEnumSelectionItem matches case-insensitively", () => {
  const items = [{ value: "Default", name: "标准", description: "" }];
  assert.equal(findEnumSelectionItem(items, "default")?.name, "标准");
});

test("resolveVarOrValueDisplayMode keeps expression literals in input mode", () => {
  const items = [{ value: "default", name: "标准", description: "" }];
  assert.equal(
    resolveVarOrValueDisplayMode({ varKey: "", value: "$={PASS}&&{BT}!=\"\"" }, items),
    "input",
  );
});

test("resolveVarOrValueDisplayMode ignores synthetic obsolete enum rows", () => {
  const items = [{ value: "a", name: "A", description: "" }];
  const withObsolete = buildEnumSelectionOptions(items, "legacy", false);
  assert.equal(withObsolete.length, 2);
  assert.equal(resolveVarOrValueDisplayMode({ varKey: "", value: "legacy" }, items), "input");
  assert.equal(resolveVarOrValueDisplayMode({ varKey: "", value: "legacy" }, withObsolete), "enum");
});

test("varOrValueParamAllowsFreeInput is true for UseVarOrInput even when allowInput false", () => {
  assert.equal(
    varOrValueParamAllowsFreeInput({ allowInput: false, variableMode: ParamVariableMode.UseVarOrInput }),
    true,
  );
});
