import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEnumSelectionOptions, findEnumSelectionItem } from "./stepParamEnumOptions";

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
