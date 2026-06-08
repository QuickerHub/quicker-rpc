import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeExplorerTreeSignature,
  type ActionExplorerTree,
} from "./action-explorer-tree";
import { findActionMetadataInExplorerTree } from "./action-workspace-metadata";

const ACTION_ID = "9101812a-7f29-4e37-9c0c-3cd01f3bac01";
const ROOT = ".quicker/actions";

function actionTree(icon?: string): ActionExplorerTree {
  return {
    rootPath: ROOT,
    rootLabel: "动作项目",
    children: [
      {
        name: ACTION_ID,
        path: `${ROOT}/${ACTION_ID}`,
        kind: "directory",
        title: "剪贴板去重排序",
        description: "读取剪贴板文本",
        icon,
        actionId: ACTION_ID,
      },
    ],
  };
}

describe("action-workspace-metadata", () => {
  it("findActionMetadataInExplorerTree returns icon from tree node", () => {
    const meta = findActionMetadataInExplorerTree(
      actionTree("fa:Light_Clipboard"),
      ACTION_ID,
    );
    assert.ok(meta);
    assert.equal(meta!.icon, "fa:Light_Clipboard");
    assert.equal(meta!.title, "剪贴板去重排序");
  });

  it("computeExplorerTreeSignature changes when icon changes", () => {
    const before = computeExplorerTreeSignature(actionTree("fa:Light_Clipboard"));
    const after = computeExplorerTreeSignature(actionTree("fa:Light_Bolt"));
    assert.notEqual(before, after);
  });
});
