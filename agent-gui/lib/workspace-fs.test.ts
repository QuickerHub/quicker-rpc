import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { runWithQkrpcCwd } from "@/lib/qkrpc-request-context";
import {
  editWorkspaceFile,
  listWorkspaceFiles,
  readWorkspaceFile,
  resolveWorkspacePath,
  writeWorkspaceFile,
} from "@/lib/workspace-fs";

test("resolveWorkspacePath rejects traversal outside cwd", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-gui-ws-"));
  try {
    runWithQkrpcCwd(root, () => {
      const escaped = resolveWorkspacePath("../outside.txt");
      assert.equal(escaped.ok, false);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("write/read/edit workspace files under cwd", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-gui-ws-"));
  try {
    await runWithQkrpcCwd(root, async () => {
      const write = await writeWorkspaceFile("nested/hello.txt", "hello world");
      assert.equal(write.ok, true);

      const read = await readWorkspaceFile("nested/hello.txt");
      assert.equal(read.ok, true);
      if (read.ok) {
        assert.equal(read.content, "hello world");
      }

      const edit = await editWorkspaceFile("nested/hello.txt", "world", "agent");
      assert.equal(edit.ok, true);
      if (edit.ok) {
        assert.equal(edit.replacements, 1);
      }

      const listed = await listWorkspaceFiles("nested", { recursive: true });
      assert.equal(listed.ok, true);
      if (listed.ok) {
        assert.ok(listed.entries.some((entry) => entry.path === "hello.txt"));
      }
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("editWorkspaceFile fails when oldString is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-gui-ws-"));
  try {
    await runWithQkrpcCwd(root, async () => {
      await writeFile(join(root, "a.txt"), "alpha", "utf8");
      const edit = await editWorkspaceFile("a.txt", "missing", "x");
      assert.equal(edit.ok, false);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
