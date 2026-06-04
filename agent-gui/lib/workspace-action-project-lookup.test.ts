import assert from "node:assert/strict";
import { test } from "node:test";
import type { ActionExplorerTree } from "@/lib/action-explorer-tree";
import {
  findWorkspaceProjectsInTree,
  findWorkspaceSubProgramsInTree,
} from "@/lib/workspace-action-project-lookup";

const subTree: ActionExplorerTree = {
  rootLabel: "公共子程序",
  rootPath: ".quicker/subprograms",
  children: [
    {
      name: "58830061-a69f-4306-83e3-5ffbab98471b",
      path: ".quicker/subprograms/58830061-a69f-4306-83e3-5ffbab98471b",
      kind: "directory",
      title: "aaabbbb",
      subProgramId: "58830061-a69f-4306-83e3-5ffbab98471b",
    },
    {
      name: "by-name-dir",
      path: ".quicker/subprograms/by-name-dir",
      kind: "directory",
      title: "按名称",
      subProgramId: "d6b96943-732f-467b-927a-666f2a83c86f",
    },
  ],
};

test("findWorkspaceSubProgramsInTree matches id or directory name", () => {
  const byId = findWorkspaceSubProgramsInTree(subTree, [
    "58830061-a69f-4306-83e3-5ffbab98471b",
  ]);
  assert.equal(byId.length, 1);
  assert.equal(byId[0]?.kind, "subprogram");
  assert.equal(byId[0]?.id, "58830061-a69f-4306-83e3-5ffbab98471b");

  const byName = findWorkspaceSubProgramsInTree(subTree, ["按名称"]);
  assert.equal(byName.length, 1);
  assert.equal(byName[0]?.id, "d6b96943-732f-467b-927a-666f2a83c86f");
});

test("findWorkspaceProjectsInTree returns action kind", () => {
  const actionId = "aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const tree: ActionExplorerTree = {
    rootLabel: "动作",
    rootPath: ".quicker/actions",
    children: [
      {
        name: actionId,
        path: `.quicker/actions/${actionId}`,
        kind: "directory",
        title: "Demo",
        actionId,
      },
    ],
  };
  const hits = findWorkspaceProjectsInTree(tree, [actionId]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.kind, "action");
  assert.equal(hits[0]?.id, actionId);
});
