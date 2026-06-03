import assert from "node:assert/strict";
import test from "node:test";
import {
  actionProjectDataToolDisplayName,
  isActionProjectDataTool,
} from "./action-project-data-tools.ts";

test("action project data tool helpers", () => {
  assert.equal(isActionProjectDataTool("workspace_action_write_data"), true);
  assert.equal(isActionProjectDataTool("workspace_file_write"), false);
  assert.equal(
    actionProjectDataToolDisplayName("workspace_action_write_data"),
    "write-data",
  );
});
