import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchWorkspaceFileCached,
  invalidateWorkspaceFileReadCache,
  readWorkspaceFileReadCache,
  seedWorkspaceFileReadCache,
} from "./workspace-file-read-cache";

test("fetchWorkspaceFileCached dedupes concurrent reads", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { ok: true as const, path: "a.txt", content: "hello", truncated: false };
  };

  const cwd = "/tmp/ws";
  const path = ".quicker/actions/id/files/a.txt";
  const [a, b] = await Promise.all([
    fetchWorkspaceFileCached(cwd, path, fetcher),
    fetchWorkspaceFileCached(cwd, path, fetcher),
  ]);

  assert.equal(calls, 1);
  assert.equal(a.ok && b.ok && a.content === "hello" && b.content === "hello", true);
  assert.equal(readWorkspaceFileReadCache(cwd, path)?.content, "hello");
});

test("invalidateWorkspaceFileReadCache drops cached entry", () => {
  const cwd = "/tmp/ws";
  const path = "files/main.cs";
  seedWorkspaceFileReadCache(cwd, path, "code", { truncated: false });
  assert.ok(readWorkspaceFileReadCache(cwd, path));
  invalidateWorkspaceFileReadCache(cwd, path);
  assert.equal(readWorkspaceFileReadCache(cwd, path), undefined);
});
