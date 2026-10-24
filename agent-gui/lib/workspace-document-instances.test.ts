import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorkspaceDocumentInstances, createWorkspaceDocumentPresentation, runWorkspaceDocumentStorage, workspaceDocumentKey, workspaceDocumentPathInProject } from "./workspace-document-instances";

const tab = (content = "baseline") => ({ id: "file:data.json", path: "data.json", content });

test("visited documents have one owner across view/cwd changes and only explicit close releases it", () => {
  const instances = createWorkspaceDocumentInstances();
  const a = instances.visit("C:/a", tab());
  assert.equal(instances.visit("C:/a", tab("new baseline")), a);
  instances.observe("C:/b", []);
  const b = instances.visit("C:/b", tab("other document"));
  assert.notEqual(a, b);
  instances.observe("C:/a", []); // hidden/restored tabs are not close operations
  instances.observe("C:/a", [{ ...tab(""), loading: true }]);
  assert.equal(instances.getSnapshot()[0].tab.content, "new baseline");
  assert.equal(instances.isCurrent(a), true);
  instances.close("C:/a", a.tabId);
  assert.equal(instances.isCurrent(a), false);
  assert.equal(instances.isCurrent(b), true);
  const reopened = instances.visit("C:/a", tab());
  assert.notEqual(reopened.instanceId, a.instanceId);
  instances.closeWorkspace("C:/b");
  assert.equal(instances.isCurrent(b), false);
  instances.dispose();
  assert.equal(instances.isCurrent(reopened), false);
  assert.throws(() => instances.visit("C:/a", tab()), /disposed/);
  assert.notEqual(workspaceDocumentKey("C:/", "file:x"), workspaceDocumentKey("C:", "file:x"));
});

test("a completed empty external read is still observed, while mismatched descriptors cannot take an owner", () => {
  const instances = createWorkspaceDocumentInstances();
  const owner = instances.visit("C:/a", tab());
  assert.equal(instances.update(owner, { ...tab("foreign"), path: "other.json" }), false);
  assert.equal(instances.update(owner, tab("")), true);
  assert.equal(instances.getSnapshot()[0].tab.content, "");
});

test("project deletion releases only exact project descendants in its original cwd", () => {
  const instances = createWorkspaceDocumentInstances();
  const project = ".quicker/actions/a";
  const visit = (cwd: string, path: string) => instances.visit(cwd, { id: `file:${path}`, path, content: "baseline" });
  const a = visit("C:/one", `${project}/data.json`);
  const nested = visit("C:/one", `${project}/subprograms/child/data.json`);
  const prefixSibling = visit("C:/one", `${project}-copy/data.json`);
  const b = visit("C:/one", ".quicker/actions/b/data.json");
  const otherCwd = visit("C:/two", `${project}/data.json`);
  instances.closeProject("C:/one", project);
  assert.equal(instances.isCurrent(a), false);
  assert.equal(instances.isCurrent(nested), false);
  for (const owner of [prefixSibling, b, otherCwd]) assert.equal(instances.isCurrent(owner), true);
  assert.equal(workspaceDocumentPathInProject(`${project}/files/a`, `${project}/`), true);
  assert.equal(workspaceDocumentPathInProject(`${project}-copy/data.json`, project), false);
  assert.equal(workspaceDocumentPathInProject(`${project}/data.json`, ""), false);
  assert.equal(workspaceDocumentPathInProject(`${project}/data.json`, "."), false);
});

test("storage captures immutable cwd/path and ignores a receipt after close/reopen", async () => {
  const instances = createWorkspaceDocumentInstances();
  const a = instances.visit("C:/a", tab());
  let finish!: (value: string) => void;
  const calls: string[][] = [];
  const pending = runWorkspaceDocumentStorage(instances, a, (cwd, path) => {
    calls.push([cwd, path]);
    return new Promise<string>((resolve) => { finish = resolve; });
  });
  instances.visit("C:/b", tab());
  instances.close("C:/a", a.tabId);
  const reopened = instances.visit("C:/a", tab("fresh"));
  finish("late old save");
  assert.equal(await pending, undefined);
  assert.deepEqual(calls, [["C:/a", "data.json"]]);
  assert.equal(instances.getSnapshot().find((item) => item.owner === reopened)?.tab.content, "fresh");
  assert.equal(await runWorkspaceDocumentStorage(instances, a, async () => { throw new Error("closed owner ran"); }), undefined);
});

test("pending storage remains valid while hidden and returns failures without retry", async () => {
  const instances = createWorkspaceDocumentInstances();
  const a = instances.visit("C:/a", tab());
  let finish!: (value: { ok: false; error: string }) => void;
  let count = 0;
  const pending = runWorkspaceDocumentStorage(instances, a, async () => { count++; return new Promise<{ ok: false; error: string }>((resolve) => { finish = resolve; }); });
  instances.visit("C:/b", tab());
  finish({ ok: false, error: "disk denied" });
  assert.deepEqual(await pending, { ok: false, error: "disk denied" });
  assert.equal(count, 1);
});

test("presentation follows the current Chat and late cleanup cannot clear its successor", () => {
  const presentation = createWorkspaceDocumentPresentation<{ thread: string; pin: () => void }>();
  const a = {}, b = {};
  const calls: string[] = [];
  presentation.register(a, { thread: "a", pin: () => calls.push("a") });
  presentation.register(b, { thread: "b", pin: () => calls.push("b") });
  presentation.release(a);
  presentation.getCurrent()?.value.pin();
  assert.deepEqual(calls, ["b"]);
  presentation.release(b);
  assert.equal(presentation.getCurrent(), null);
});

test("unvisited load and visited refresh share latest publication rights across real promise completion order", async () => {
  const instances = createWorkspaceDocumentInstances();
  let finishLoad!: (value: string) => void, finishRefresh!: (value: string) => void;
  const load = instances.beginRead("C:/a", tab().id, tab().path);
  const loadResult = new Promise<string>((resolve) => { finishLoad = resolve; }).then((content) => load.publish(() => instances.update(owner, tab(content))));
  const owner = instances.visit("C:/a", tab());
  const refresh = instances.beginRead(owner.cwd, owner.tabId, owner.path, owner);
  const refreshResult = new Promise<string>((resolve) => { finishRefresh = resolve; }).then((content) => refresh.publish(() => instances.update(owner, tab(content))));
  finishRefresh("new refresh");
  assert.equal(await refreshResult, true);
  finishLoad("older load");
  assert.equal(await loadResult, false);
  assert.equal(instances.getSnapshot()[0].tab.content, "new refresh");
});

test("publication rechecks the slot after an await handoff, and save invalidation is scoped by cwd", async () => {
  const instances = createWorkspaceDocumentInstances();
  const a = instances.visit("C:/a", tab()), b = instances.visit("C:/b", tab());
  const readA = instances.beginRead(a.cwd, a.tabId, a.path, a);
  const readB = instances.beginRead(b.cwd, b.tabId, b.path, b);
  assert.equal(readA.isCurrent(), true);
  queueMicrotask(() => instances.invalidateRead(a.cwd, a.tabId)); // a successful save invalidates older reads at publication
  await Promise.resolve();
  assert.equal(readA.publish(() => { throw new Error("late A publication"); }), false);
  assert.equal(readB.publish(() => instances.update(b, tab("B result"))), true);
  const old = instances.beginRead(a.cwd, a.tabId, a.path, a);
  instances.close(a.cwd, a.tabId);
  const reopened = instances.visit(a.cwd, tab());
  assert.notEqual(reopened, a);
  assert.equal(old.publish(() => { throw new Error("closed owner published"); }), false);
});
