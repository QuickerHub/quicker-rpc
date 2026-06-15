import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveProgramDiskPathFromWorkspaceTool } from "./program-data-reload-from-tools";

const ACTION_ID = "008a27ce-1a2d-47af-b3dc-e2a5308865d2";

test("resolveProgramDiskPathFromWorkspaceTool maps edit_data to data.json", () => {
  assert.equal(
    resolveProgramDiskPathFromWorkspaceTool(
      "workspace_program",
      { action: "edit_data", target: "action", id: ACTION_ID, oldString: "a", newString: "b" },
      { ok: true, exitCode: 0, data: { action: "program-data-edit", path: `.quicker/actions/${ACTION_ID}/data.json` } },
    ),
    `.quicker/actions/${ACTION_ID}/data.json`,
  );
});

test("resolveProgramDiskPathFromWorkspaceTool falls back to input id", () => {
  assert.equal(
    resolveProgramDiskPathFromWorkspaceTool(
      "workspace_program",
      { action: "write_data", target: "action", id: ACTION_ID, content: "{}" },
      { ok: true, exitCode: 0, data: { action: "program-data-write", success: true } },
    ),
    `.quicker/actions/${ACTION_ID}/data.json`,
  );
});

test("resolveProgramDiskPathFromWorkspaceTool ignores patch", () => {
  assert.equal(
    resolveProgramDiskPathFromWorkspaceTool(
      "workspace_program",
      { action: "patch", target: "action", id: ACTION_ID },
      { ok: true, exitCode: 0, data: { action: "program-patch", success: true } },
    ),
    undefined,
  );
});
