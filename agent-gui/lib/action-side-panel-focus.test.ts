import assert from "node:assert/strict";
import test from "node:test";
import {
  actionExplorerTreeRef,
  actionProjectRootFromWorkspacePath,
  resolveFocusedActionIdFromEditorPath,
} from "./action-side-panel-focus.ts";

test("actionProjectRootFromWorkspacePath", () => {
  assert.equal(
    actionProjectRootFromWorkspacePath(".quicker/actions/abc/data.json"),
    ".quicker/actions/abc",
  );
  assert.equal(
    actionProjectRootFromWorkspacePath(".quicker/actions/abc/files/foo.js"),
    ".quicker/actions/abc",
  );
  assert.equal(
    actionProjectRootFromWorkspacePath(".quicker/subprograms/foo/data.json"),
    undefined,
  );
});

test("resolveFocusedActionIdFromEditorPath uses GUID folder name", () => {
  const id = "a2adb839-673d-4f4a-9c2e-8f1e2d3c4b5a";
  assert.equal(
    resolveFocusedActionIdFromEditorPath(`.quicker/actions/${id}/data.json`),
    id,
  );
});

test("resolveFocusedActionIdFromEditorPath uses tree actionId for title folder", () => {
  const id = "a2adb839-673d-4f4a-9c2e-8f1e2d3c4b5a";
  actionExplorerTreeRef.current = {
    rootPath: ".quicker/actions",
    rootLabel: "动作项目",
    children: [
      {
        path: ".quicker/actions/剪贴板统计",
        name: "剪贴板统计",
        kind: "directory",
        actionId: id,
      },
    ],
  };
  assert.equal(
    resolveFocusedActionIdFromEditorPath(".quicker/actions/剪贴板统计/data.json"),
    id,
  );
  actionExplorerTreeRef.current = null;
});
