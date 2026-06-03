import assert from "node:assert/strict";
import { test } from "node:test";
import {
  beginActionProjectImport,
  endActionProjectImport,
  isActionProjectImporting,
  replaceActionProjectImports,
} from "@/lib/action-project-import-state";

const ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

test("begin/end toggles importing flag", () => {
  replaceActionProjectImports([]);
  assert.equal(isActionProjectImporting(ID), false);
  beginActionProjectImport(ID, { source: "pull" });
  assert.equal(isActionProjectImporting(ID), true);
  endActionProjectImport(ID);
  assert.equal(isActionProjectImporting(ID), false);
});

test("replaceActionProjectImports clears stale ids", () => {
  beginActionProjectImport(ID);
  replaceActionProjectImports([]);
  assert.equal(isActionProjectImporting(ID), false);
});
