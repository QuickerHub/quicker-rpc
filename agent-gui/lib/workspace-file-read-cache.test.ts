import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchWorkspaceFileCached,
  invalidateWorkspaceFileReadCache,
  invalidateWorkspaceProjectFileReadCache,
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

test("an invalidated pending read still returns to its waiters but cannot seed the cache", async () => {
  const cwd = "/fixture/invalidated";
  const path = "project/data.json";
  let finish!: (value: { ok: true; path: string; content: string; truncated: false }) => void;
  const promise = new Promise<{ ok: true; path: string; content: string; truncated: false }>((resolve) => { finish = resolve; });
  const first = fetchWorkspaceFileCached(cwd, path, () => promise);
  const second = fetchWorkspaceFileCached(cwd, path, async () => { throw new Error("existing waiter must dedupe"); });
  invalidateWorkspaceFileReadCache(cwd, path);
  finish({ ok: true, path, content: "departed", truncated: false });
  assert.equal((await first).ok, true);
  assert.equal((await second).ok, true);
  assert.equal(readWorkspaceFileReadCache(cwd, path), undefined);
});

test("an older read cannot seed over or unregister its replacement request", async () => {
  const cwd = "/fixture/replaced";
  const path = "project/data.json";
  type Result = { ok: true; path: string; content: string; truncated: false };
  let finishOld!: (value: Result) => void, finishNew!: (value: Result) => void;
  const old = fetchWorkspaceFileCached(cwd, path, () => new Promise<Result>((resolve) => { finishOld = resolve; }));
  invalidateWorkspaceFileReadCache(cwd, path);
  const replacement = fetchWorkspaceFileCached(cwd, path, () => new Promise<Result>((resolve) => { finishNew = resolve; }));
  finishOld({ ok: true, path, content: "old", truncated: false });
  await old;
  assert.equal(readWorkspaceFileReadCache(cwd, path), undefined);
  const waiter = fetchWorkspaceFileCached(cwd, path, async () => { throw new Error("old completion removed replacement owner"); });
  finishNew({ ok: true, path, content: "new", truncated: false });
  assert.deepEqual(await waiter, await replacement);
  assert.equal(readWorkspaceFileReadCache(cwd, path)?.content, "new");
});

test("project invalidation preserves prefix siblings and the same path in another cwd", async () => {
  const cwd = "/fixture/project-delete", project = ".quicker/actions/a";
  const deletedPath = `${project}/data.json`, sibling = `${project}-copy/data.json`;
  seedWorkspaceFileReadCache(cwd, deletedPath, "deleted");
  seedWorkspaceFileReadCache(cwd, sibling, "sibling");
  seedWorkspaceFileReadCache("/fixture/other", deletedPath, "other");
  invalidateWorkspaceProjectFileReadCache(cwd, project);
  assert.equal(readWorkspaceFileReadCache(cwd, deletedPath), undefined);
  assert.equal(readWorkspaceFileReadCache(cwd, sibling)?.content, "sibling");
  assert.equal(readWorkspaceFileReadCache("/fixture/other", deletedPath)?.content, "other");
});

test("invalidateWorkspaceFileReadCache drops cached entry", () => {
  const cwd = "/tmp/ws";
  const path = "files/main.cs";
  seedWorkspaceFileReadCache(cwd, path, "code", { truncated: false });
  assert.ok(readWorkspaceFileReadCache(cwd, path));
  invalidateWorkspaceFileReadCache(cwd, path);
  assert.equal(readWorkspaceFileReadCache(cwd, path), undefined);
});
