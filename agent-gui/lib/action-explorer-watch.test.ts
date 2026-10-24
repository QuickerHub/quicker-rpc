import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  createActionExplorerWatchOwner,
  isActionExplorerWatchPath,
  resolveProgramDataPathFromWatch,
  subscribeActionExplorerWatch,
  type ActionExplorerWatchEvent,
} from "./action-explorer-watch";

function workspace() {
  const parent = resolve("../.tmp");
  fs.mkdirSync(parent, { recursive: true });
  const cwd = fs.mkdtempSync(join(parent, "explorer-watch-owner-"));
  fs.mkdirSync(join(cwd, ".quicker/actions"), { recursive: true });
  fs.mkdirSync(join(cwd, ".quicker/subprograms"), { recursive: true });
  return cwd;
}

function subscription(cwd: string, owner?: ReturnType<typeof createActionExplorerWatchOwner>) {
  const events: ActionExplorerWatchEvent[] = [];
  let ready!: () => void;
  const tree = new Promise<void>((done) => { ready = done; });
  const subscribe = () => subscribeActionExplorerWatch(cwd, (event) => {
    events.push(event);
    if (event.ok && event.type === "tree") ready();
  });
  return { events, tree, unsubscribe: owner ? owner.run(subscribe) : subscribe() };
}

function observeWatchers(t: TestContext) {
  const records: { closes: number; notify: (filename: string) => void }[] = [];
  const watch = fs.watch;
  t.mock.method(fs, "watch", (path, options, listener) => {
    const watcher = watch(path, options, listener);
    const record = { closes: 0, notify: (filename: string) => listener("change", filename) };
    records.push(record);
    const close = watcher.close.bind(watcher);
    t.mock.method(watcher, "close", () => { record.closes++; close(); });
    return watcher;
  });
  return records;
}

test("isActionExplorerWatchPath matches .quicker/actions and subprograms tree", () => {
  assert.equal(isActionExplorerWatchPath(".quicker/actions"), true);
  assert.equal(
    isActionExplorerWatchPath(".quicker/actions/foo/data.json"),
    true,
  );
  assert.equal(isActionExplorerWatchPath(".quicker/subprograms"), true);
  assert.equal(
    isActionExplorerWatchPath(".quicker/subprograms/foo/data.json"),
    true,
  );
  assert.equal(isActionExplorerWatchPath(".quicker"), true);
  assert.equal(isActionExplorerWatchPath("src/main.ts"), false);
});

test("resolveProgramDataPathFromWatch maps fs.watch filename to workspace path", () => {
  const actionId = "846b4132-ad73-42e8-b2f9-c42fe718ae20";
  assert.equal(
    resolveProgramDataPathFromWatch(
      ".quicker/actions",
      `${actionId}/data.json`,
    ),
    `.quicker/actions/${actionId}/data.json`,
  );
  assert.equal(
    resolveProgramDataPathFromWatch(
      ".quicker/actions",
      `${actionId}\\data.json`,
    ),
    `.quicker/actions/${actionId}/data.json`,
  );
  assert.equal(
    resolveProgramDataPathFromWatch(
      ".quicker/actions",
      `${actionId}/subprograms/sub-1/data.json`,
    ),
    `.quicker/actions/${actionId}/subprograms/sub-1/data.json`,
  );
  assert.equal(
    resolveProgramDataPathFromWatch(".quicker/subprograms", "foo/data.json"),
    ".quicker/subprograms/foo/data.json",
  );
  assert.equal(
    resolveProgramDataPathFromWatch(".quicker/actions", "info.json"),
    null,
  );
});

test("runtime owners isolate the same workspace from each other and the compatible Next cache", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const records = observeWatchers(t);
  const cwd = workspace();
  const first = createActionExplorerWatchOwner(), second = createActionExplorerWatchOwner();
  const a = subscription(cwd, first), b = subscription(cwd, second), next = subscription(cwd);
  try {
    await Promise.all([a.tree, b.tree, next.tree]);
    assert.equal(records.length, 6, "each owner holds its own two real filesystem watchers");
    const a2 = subscription(cwd, first);
    await a2.tree;
    a.unsubscribe();
    assert.ok(records.every((record) => record.closes === 0), "another subscriber keeps the session active");
    a2.unsubscribe();
    a2.unsubscribe();
    assert.ok(records.every((record) => record.closes === 0), "last unsubscribe preserves the idle cache");
    const stop = first.dispose();
    assert.equal(first.dispose(), stop);
    await stop;
    assert.deepEqual(records.map((record) => record.closes), [1, 1, 0, 0, 0, 0]);
    const stopped = subscription(cwd, first);
    assert.deepEqual(stopped.events, [{ ok: false, type: "error", error: "Explorer watch service is stopped" }]);
    const b2 = subscription(cwd, second), next2 = subscription(cwd);
    await Promise.all([b2.tree, next2.tree]);
    assert.equal(records.length, 6, "other owners retain their watchers and cached tree");
    b2.unsubscribe(); next2.unsubscribe();
    await second.dispose();
    b.unsubscribe();
    next.unsubscribe();
    t.mock.timers.tick(30_000);
    assert.ok(records.every((record) => record.closes === 1));
  } finally {
    a.unsubscribe(); b.unsubscribe(); next.unsubscribe();
    await Promise.all([first.dispose(), second.dispose()]);
    t.mock.timers.tick(30_000);
  }
});

test("last unsubscribe keeps the 30s idle policy, reconnect cancels it, and duplicate unsubscribe does not rearm it", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const records = observeWatchers(t), owner = createActionExplorerWatchOwner();
  const cwd = workspace();
  try {
    const first = subscription(cwd, owner);
    await first.tree;
    first.unsubscribe();
    t.mock.timers.tick(29_999);
    assert.ok(records.every((record) => record.closes === 0));
    const reconnected = subscription(cwd, owner);
    await reconnected.tree;
    t.mock.timers.tick(1);
    assert.equal(records.length, 2);
    assert.ok(records.every((record) => record.closes === 0));
    reconnected.unsubscribe();
    t.mock.timers.tick(29_999);
    reconnected.unsubscribe();
    t.mock.timers.tick(1);
    assert.deepEqual(records.map((record) => record.closes), [1, 1]);
  } finally { await owner.dispose(); }
});

for (const retireDuringRead of [false, true]) {
  test(`stop awaits an actual in-flight filesystem read, rejects late publication and cannot revive a ${retireDuringRead ? "retired idle" : "live"} session`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    const records = observeWatchers(t), owner = createActionExplorerWatchOwner();
    const cwd = workspace();
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((done) => { release = done; });
    const reading = new Promise<void>((done) => { entered = done; });
    const readdir = fsp.readdir;
    t.mock.method(fsp, "readdir", async (...args: Parameters<typeof fsp.readdir>) => {
      if (String(args[0]) === join(cwd, ".quicker/actions")) { entered(); await gate; }
      return Reflect.apply(readdir, fsp, args);
    });
    const active = subscription(cwd, owner);
    try {
      await reading;
      if (retireDuringRead) { active.unsubscribe(); t.mock.timers.tick(30_000); }
      let settled = false;
      const stopped = owner.dispose();
      void stopped.then(() => { settled = true; });
      await Promise.resolve();
      assert.deepEqual(records.map((record) => record.closes), [1, 1]);
      assert.equal(settled, false, "the runtime still owns a read even after idle disposal removed its session");
      release();
      await stopped;
      active.unsubscribe();
      records[0].notify("late/data.json");
      t.mock.timers.tick(30_000);
      assert.equal(active.events.length, 0, "a read completing after stop never publishes a tree or schedules work");
      assert.ok(records.every((record) => record.closes === 1));
    } finally { release(); active.unsubscribe(); await owner.dispose(); }
  });
}

test("stop clears a queued rebuild and late watcher callbacks cannot schedule another", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const records = observeWatchers(t), owner = createActionExplorerWatchOwner();
  const active = subscription(workspace(), owner);
  try {
    await active.tree;
    t.mock.timers.tick(401);
    records[0].notify("pending/data.json");
    await owner.dispose();
    const reads = t.mock.method(fsp, "readdir");
    records[0].notify("late/data.json");
    active.unsubscribe();
    t.mock.timers.tick(30_000);
    assert.equal(reads.mock.callCount(), 0);
    assert.equal(active.events.length, 1);
    assert.ok(records.every((record) => record.closes === 1));
  } finally { active.unsubscribe(); await owner.dispose(); }
});
