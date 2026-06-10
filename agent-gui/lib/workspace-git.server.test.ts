import assert from "node:assert/strict";
import test from "node:test";

import { parseGitPorcelain } from "@/lib/workspace-git.server";

test("parseGitPorcelain maps modified and untracked", () => {
  const files = parseGitPorcelain(" M agent-gui/foo.ts\n?? new.txt\n");
  assert.equal(files.length, 2);
  assert.deepEqual(files[0], { path: "agent-gui/foo.ts", status: "modified" });
  assert.deepEqual(files[1], { path: "new.txt", status: "untracked" });
});

test("parseGitPorcelain parses rename", () => {
  const files = parseGitPorcelain("R  old.ts -> new.ts\n");
  assert.equal(files.length, 1);
  assert.deepEqual(files[0], {
    path: "new.ts",
    oldPath: "old.ts",
    status: "renamed",
  });
});

test("parseGitPorcelain maps staged added", () => {
  const files = parseGitPorcelain("A  added.ts\n");
  assert.deepEqual(files[0], { path: "added.ts", status: "added" });
});
