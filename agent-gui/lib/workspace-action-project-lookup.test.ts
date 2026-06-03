import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findWorkspaceProjectsInTree,
  workspaceDeleteCheckboxLabel,
} from "./workspace-action-project-lookup.ts";

const ACTION_A = "aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const ACTION_B = "11111111-2222-3333-4444-555555555555";

test("findWorkspaceProjectsInTree matches project roots by action id", () => {
  const tree = {
    rootPath: ".quicker/actions",
    rootLabel: "actions",
    children: [
      {
        name: ACTION_A,
        path: `.quicker/actions/${ACTION_A}`,
        kind: "directory" as const,
        title: "测试动作 A",
        actionId: ACTION_A,
      },
      {
        name: "other-folder",
        path: ".quicker/actions/other-folder",
        kind: "directory" as const,
        title: "无关",
      },
    ],
  };

  const hits = findWorkspaceProjectsInTree(tree, [ACTION_A.toUpperCase(), ACTION_B]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0]!.actionId, ACTION_A);
  assert.equal(hits[0]!.title, "测试动作 A");
});

test("workspaceDeleteCheckboxLabel pluralizes hit count", () => {
  assert.match(workspaceDeleteCheckboxLabel(1), /动作项目/);
  assert.match(workspaceDeleteCheckboxLabel(3), /3 个/);
});
