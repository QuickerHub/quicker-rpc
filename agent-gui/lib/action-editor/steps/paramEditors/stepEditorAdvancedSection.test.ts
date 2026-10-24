import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldExpandAdvancedParamSection } from "./stepEditorAdvancedSection";

test("native advanced section defaults keep short lists open and collapse four or more rows", () => {
  for (const count of [0, 1, 2, 3]) assert.equal(shouldExpandAdvancedParamSection(count), true);
  for (const count of [4, 5, 12]) assert.equal(shouldExpandAdvancedParamSection(count), false);
});
