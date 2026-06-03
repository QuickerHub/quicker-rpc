import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { runWithQkrpcCwd } from "@/lib/qkrpc-request-context";
import { DEFAULT_READ_CHARS } from "@/lib/workspace-file-helpers";
import {
  editWorkspaceFile,
  getWorkspaceFileInfo,
  grepWorkspacePath,
  listWorkspaceFiles,
  readWorkspaceFile,
  readWorkspaceFileForExplorer,
  readWorkspaceFileSnapshot,
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

test("readWorkspaceFileForExplorer loads full data.json under UI size cap", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-gui-ws-"));
  try {
    await runWithQkrpcCwd(root, async () => {
      const body = '{"steps":[' + '"x",'.repeat(20_000) + '"y"]}';
      await writeFile(join(root, "data.json"), body, "utf8");
      const agentRead = await readWorkspaceFile("data.json");
      const uiRead = await readWorkspaceFileForExplorer("data.json");
      assert.equal(agentRead.ok, true);
      assert.equal(uiRead.ok, true);
      if (agentRead.ok && uiRead.ok) {
        assert.equal(agentRead.truncated, true);
        assert.equal(agentRead.content.length, DEFAULT_READ_CHARS);
        assert.equal(uiRead.truncated, false);
        assert.equal(uiRead.content, body);
      }
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readWorkspaceFile truncates large files without loading entire content", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-gui-ws-"));
  try {
    await runWithQkrpcCwd(root, async () => {
      const body = "line\n".repeat(250_000);
      await writeFile(join(root, "big.txt"), body, "utf8");

      const read = await readWorkspaceFile("big.txt");
      assert.equal(read.ok, true);
      if (read.ok) {
        assert.equal(read.content.length, DEFAULT_READ_CHARS);
        assert.equal(read.truncated, true);
        assert.equal(read.totalChars, undefined);
        assert.ok(read.readHint?.includes("offset="));
      }

      const partial = await readWorkspaceFile("big.txt", { offset: 10, limit: 5 });
      assert.equal(partial.ok, true);
      if (partial.ok) {
        assert.equal(partial.content, body.slice(10, 15));
        assert.equal(partial.truncated, true);
        assert.equal(partial.totalChars, body.length);
      }
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readWorkspaceFile supports startLine slices", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-gui-ws-"));
  try {
    await runWithQkrpcCwd(root, async () => {
      await writeFile(join(root, "lines.txt"), "a\nb\nc\nd\n", "utf8");
      const slice = await readWorkspaceFile("lines.txt", { startLine: 2, endLine: 3 });
      assert.equal(slice.ok, true);
      if (slice.ok) {
        assert.equal(slice.content, "b\nc");
        assert.equal(slice.startLine, 2);
        assert.equal(slice.endLine, 3);
        assert.equal(slice.truncated, false);
      }
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("editWorkspaceFile rejects ambiguous oldString", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-gui-ws-"));
  try {
    await runWithQkrpcCwd(root, async () => {
      await writeFile(join(root, "dup.txt"), "foo\nfoo\n", "utf8");
      const edit = await editWorkspaceFile("dup.txt", "foo", "bar");
      assert.equal(edit.ok, false);
      if (!edit.ok) {
        assert.equal(edit.matchCount, 2);
        assert.deepEqual(edit.matchLines, [1, 2]);
      }
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("grepWorkspacePath finds literal matches", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-gui-ws-"));
  try {
    await runWithQkrpcCwd(root, async () => {
      await mkdir(join(root, "nested"), { recursive: true });
      await writeFile(join(root, "nested/a.txt"), "hello\nworld\n", "utf8");
      const hits = await grepWorkspacePath("nested", "world", { literal: true });
      assert.equal(hits.ok, true);
      if (hits.ok) {
        assert.equal(hits.matches.length, 1);
        assert.equal(hits.matches[0]?.line, 2);
      }
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readWorkspaceFileSnapshot caps previous content size", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-gui-ws-"));
  try {
    await runWithQkrpcCwd(root, async () => {
      const body = "x".repeat(20_000);
      await writeFile(join(root, "big-snap.txt"), body, "utf8");
      const snap = await readWorkspaceFileSnapshot("big-snap.txt");
      assert.equal(snap.ok, true);
      if (snap.ok) {
        assert.equal(snap.content.length, 8_192);
        assert.equal(snap.truncated, true);
      }
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("getWorkspaceFileInfo reports size and line count", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-gui-ws-"));
  try {
    await runWithQkrpcCwd(root, async () => {
      await writeFile(join(root, "meta.txt"), "one\ntwo\n", "utf8");
      const info = await getWorkspaceFileInfo("meta.txt");
      assert.equal(info.ok, true);
      if (info.ok) {
        assert.equal(info.lineCount, 2);
        assert.equal(info.readRecommended, "full");
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
