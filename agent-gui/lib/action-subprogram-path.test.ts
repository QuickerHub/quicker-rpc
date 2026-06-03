import assert from "node:assert/strict";
import { test } from "node:test";
import {
  actionSubProgramProjectDir,
  actionSubProgramWorkspacePath,
  formatActionSubProgramPathLabel,
  parseActionSubProgramWorkspacePath,
} from "./action-subprogram-path";

const ACTION_ID = "846b4132-ad73-42e8-b2f9-c42fe718ae20";
const SUB_ID = "sub-a1b2";

test("parseActionSubProgramWorkspacePath parses action/ prefix", () => {
  const result = parseActionSubProgramWorkspacePath(
    `action/${ACTION_ID}/subprograms/${SUB_ID}/data.json`,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.parsed.actionId, ACTION_ID);
  assert.equal(result.parsed.subProgramId, SUB_ID);
  assert.equal(result.parsed.resourcePath, "data.json");
});

test("parseActionSubProgramWorkspacePath parses .quicker/actions prefix", () => {
  const result = parseActionSubProgramWorkspacePath(
    `.quicker/actions/${ACTION_ID}/subprograms/${SUB_ID}/files/main.cs`,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.parsed.resourcePath, "files/main.cs");
});

test("parseActionSubProgramWorkspacePath rejects traversal", () => {
  const result = parseActionSubProgramWorkspacePath(
    `action/${ACTION_ID}/subprograms/${SUB_ID}/files/../secret`,
  );
  assert.equal(result.ok, false);
});

test("actionSubProgramProjectDir", () => {
  assert.equal(
    actionSubProgramProjectDir(ACTION_ID, SUB_ID),
    `.quicker/actions/${ACTION_ID}/subprograms/${SUB_ID}`,
  );
});

test("formatActionSubProgramPathLabel", () => {
  assert.equal(
    formatActionSubProgramPathLabel(ACTION_ID, SUB_ID, "data.json"),
    `action/${ACTION_ID}/subprograms/${SUB_ID}/data.json`,
  );
});

test("actionSubProgramWorkspacePath", () => {
  assert.equal(
    actionSubProgramWorkspacePath(ACTION_ID, SUB_ID, "files/x.cs"),
    `.quicker/actions/${ACTION_ID}/subprograms/${SUB_ID}/files/x.cs`,
  );
});
