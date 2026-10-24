import assert from "node:assert/strict";
import { win32, posix } from "node:path";
import { test } from "node:test";
import { isWithinInstallerWorkspace } from "./build-installer-ownership-helper.mjs";

test("helper artifacts reject cross-volume and sibling junction destinations", () => {
  assert.equal(isWithinInstallerWorkspace("D:\\repo", "D:\\repo\\agent-gui\\electron\\build", win32), true);
  for (const outside of ["E:\\outside", "D:\\repo-other\\build", "D:\\", "D:\\repo\\..\\outside"])
    assert.equal(isWithinInstallerWorkspace("D:\\repo", outside, win32), false);
  assert.equal(isWithinInstallerWorkspace("/repo", "/repo/.tmp/build", posix), true);
  assert.equal(isWithinInstallerWorkspace("/repo", "/repo-other/build", posix), false);
});
