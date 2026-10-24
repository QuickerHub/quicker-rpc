import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readTraceRunOwner, type TraceRunOwner } from "./action-trace-owner";

const binding = { hostInstanceId: "view-fixture", hostSessionId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  endpoint: "QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", protocolVersion: 1, schemaVersion: 1,
  hostKind: "v1", capabilities: {} };
function owner(runId: string, threadId = "A"): TraceRunOwner { return readTraceRunOwner({ version: 1, runId, executionId: `execution-${threadId}`,
  threadId, cwd: `cwd-${threadId}`, actionId: "same-action", param: "same-param", toolCallId: "call_0", hostBinding: binding, invocationPath: [] })!; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
type Fixture = typeof import("./action-trace-overlay") & typeof import("./action-trace-artifact-client") & typeof import("./action-trace-feed-client");
async function fixture() {
  const globals = globalThis as unknown as { traceRead: (cwd: string, path: string) => Promise<unknown>; traceFocus: string[] };
  globals.traceFocus = []; globals.traceRead = async () => { throw new Error("Unexpected file read"); };
  const result = await build({ stdin: { contents: 'export * from "./action-trace-overlay"; export * from "./action-trace-artifact-client"; export * from "./action-trace-feed-client";', resolveDir: dirname(fileURLToPath(import.meta.url)), loader: "ts" },
    bundle: true, write: false, platform: "node", format: "cjs", plugins: [{ name: "inert-boundaries", setup(b) {
      b.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "inert" }));
      b.onResolve({ filter: /^(?:@\/lib\/|\.\/)(workspace-explorer|workspace-explorer-api)$/ }, (args) => ({ path: args.path.endsWith("-api") ? "files" : "explorer", namespace: "inert" }));
      b.onLoad({ filter: /.*/, namespace: "inert" }, (args) => ({ contents: args.path === "react" ? "export function useSyncExternalStore(){}"
        : args.path === "files" ? "export const fetchWorkspaceFile=(cwd,path)=>globalThis.traceRead(cwd,path)"
          : "export const workspaceExplorerActionsRef={current:{focusSidePanelView(id){globalThis.traceFocus.push(id)},setActiveSideView(){}}}", loader: "js" }));
    } }] });
  const module = { exports: {} }; new Function("module", "exports", "require", result.outputFiles[0].text)(module, module.exports, createRequire(import.meta.url));
  return { api: module.exports as Fixture, globals };
}
test("actual trace store writes background callbacks to their owning thread and keeps manual namespace separate", async () => {
  const { api, globals } = await fixture(); const a = owner("one"), b = owner("two", "B");
  api.switchActionTraceThread("A"); const viewA = api.prepareOwnedTraceView(a, true)!;
  api.switchActionTraceThread("B"); const viewB = api.prepareOwnedTraceView(b, true)!;
  const focusCount = globals.traceFocus.length;
  viewA.appendEvent({ sequence: 1, message: "late A" }); viewA.appendLine("late A");
  viewA.finish({ ok: true, traceOwner: a }); viewB.appendEvent({ sequence: 1, message: "only B" }); viewB.finish({ ok: true, traceOwner: b });
  assert.equal(api.getActionTraceTabs().length, 1); assert.equal(api.getActionTraceTabs()[0].events[0].message, "only B");
  assert.equal(globals.traceFocus.length, focusCount);
  const legacy = api.prepareActionTraceTab({ actionId: "same-action", param: "same-param" });
  assert.notEqual(legacy, viewB.tabId); assert.equal(api.getActionTraceTabs().length, 2);
  api.switchActionTraceThread("A"); assert.equal(api.getActionTraceTabs()[0].events[0].message, "late A");
  viewA.appendEvent({ sequence: 2, message: "after terminal" }); assert.equal(api.getActionTraceTabs()[0].events.length, 1);
});
test("closing view fences late artifact hydration and never recreates a closed run or overwrites a later run", async () => {
  const { api, globals } = await fixture(); const a = owner("old"), b = owner("new"); const read = deferred<unknown>();
  globals.traceRead = async (cwd) => { assert.equal(cwd, a.cwd); return read.promise; };
  api.switchActionTraceThread("A"); const old = api.prepareOwnedTraceView(a)!;
  const pending = api.hydrateActionTraceFromArtifact(a.cwd, { path: "artifact.json", format: "action-trace-v1", owner: a }, { view: old });
  api.closeActionTraceTab(old.tabId); const next = api.prepareOwnedTraceView(b)!;
  read.resolve({ ok: true, content: JSON.stringify({ version: 1, actionId: a.actionId, param: a.param, ok: true, traceOwner: a, events: [{ kind: "info", message: "old file" }], eventCount: 1 }) });
  assert.equal(await pending, false); assert.equal(api.prepareOwnedTraceView(a), null);
  assert.equal(api.getActionTraceTabs().length, 1); assert.equal(api.getActionTraceTabs()[0].tabId, next.tabId);
  api.releaseActionTraceThread("A"); assert.equal(next.isCurrent(), false); assert.equal(api.getActionTraceTabs().length, 0);
});
test("artifact requires exact owner/host and replay uses a distinct presentation owner with original cwd", async () => {
  const { api, globals } = await fixture(); const original = owner("replay");
  api.switchActionTraceThread("B"); const view = api.prepareOwnedTraceView(original, false, { threadId: "B", messageId: "copied" })!;
  assert.equal(view.threadId, "B"); assert.equal(view.cwd, original.cwd);
  globals.traceRead = async () => ({ ok: true, content: JSON.stringify({ version: 1, actionId: original.actionId, param: original.param, ok: true,
    traceOwner: { ...original, cwd: "different" }, events: [{ message: "wrong owner" }] }) });
  assert.equal(await api.hydrateActionTraceFromArtifact(original.cwd, { path: "artifact", format: "action-trace-v1", owner: original }, { view }), false);
  assert.equal(api.getActionTraceTabs()[0].events.length, 0);
  globals.traceRead = async () => ({ ok: true, content: JSON.stringify({ version: 1, actionId: original.actionId, param: original.param, ok: true,
    traceOwner: original, events: [{ kind: "info", message: "copied owned history" }] }) });
  assert.equal(await api.hydrateActionTraceFromArtifact(original.cwd, { path: "owned-history", format: "action-trace-v1", owner: original }, { view }), true);
  assert.equal(api.getActionTraceTabs()[0].events[0].message, "copied owned history");
  api.switchActionTraceThread("A"); assert.equal(api.getActionTraceTabs().length, 0); api.switchActionTraceThread("B");
  const history = api.prepareHistoricalTraceView({ threadId: "B", cwd: "cwd-B", messageId: "old", partKey: "call_0", actionId: original.actionId })!;
  globals.traceRead = async () => ({ ok: true, content: JSON.stringify({ version: 1, actionId: original.actionId, ok: true, events: [{ kind: "info", message: "old history" }] }) });
  assert.equal(await api.hydrateActionTraceFromArtifact(history.cwd, { path: "old", format: "action-trace-v1" }, { view: history }), true);
  assert.equal(api.getActionTraceTabs().find((tab) => tab.tabId === history.tabId)?.events[0].message, "old history");
  assert.equal(globals.traceFocus.length, 0);
});
test("shared feed waiter cancellation does not stop another observer; closed view aborts only observation", async () => {
  const { api } = await fixture(); const o = owner("shared"); api.switchActionTraceThread("A"); const view = api.prepareOwnedTraceView(o)!;
  const oldFetch = globalThis.fetch; const pending = deferred<Response>(); let signal: AbortSignal | undefined; let calls = 0;
  globalThis.fetch = async (_url, init) => { calls += 1; signal = init!.signal!; return pending.promise; };
  try {
    const a = api.startActionTraceFeed(o, view), b = api.startActionTraceFeed(o, view);
    assert.equal(calls, 1); a(); assert.equal(signal!.aborted, false);
    api.closeActionTraceTab(view.tabId); assert.equal(signal!.aborted, true); b();
    pending.resolve(new Response('event: trace\ndata: {"sequence":1,"message":"late"}\n\nevent: done\ndata: {"ok":true}\n\n'));
    await Promise.resolve(); await Promise.resolve(); assert.equal(api.getActionTraceTabs().length, 0);
  } finally { globalThis.fetch = oldFetch; }
});

test("an observer failure cannot lock a zero-event native success or overwrite its authoritative terminal", async () => {
  const { api } = await fixture(); const o = owner("zero-events"); api.switchActionTraceThread("A");
  const view = api.prepareOwnedTraceView(o)!;
  view.observeError("feed connection lost"); assert.equal(api.getActionTraceTabs()[0].status, "error");
  assert.equal(api.getActionTraceTabs()[0].resultUnknown, true);
  view.finish({ ok: true, traceOwner: o, eventCount: 0, message: "native completed" });
  assert.equal(api.getActionTraceTabs()[0].status, "success"); assert.equal(api.getActionTraceTabs()[0].errorMessage, undefined);
  assert.equal(api.getActionTraceTabs()[0].observationError, undefined); assert.equal(api.getActionTraceTabs()[0].resultUnknown, false);
  view.observeError("late observer failure"); view.appendEvent({ sequence: 1, kind: "info", message: "late" });
  assert.equal(api.getActionTraceTabs()[0].status, "success"); assert.equal(api.getActionTraceTabs()[0].events.length, 0);
});

test("actual view retains distinct native events with a repeated sequence and filters exact duplicate channels", async () => {
  const { api } = await fixture(); const o = owner("native-sequence-collision"); api.switchActionTraceThread("A");
  const view = api.prepareOwnedTraceView(o)!;
  view.appendEvent({ sequence: 1, kind: "info", message: "first" });
  view.appendEvent({ sequence: 1, kind: "info", message: "first" });
  view.appendEvent({ sequence: 1, kind: "info", message: "different" });
  view.finish({ ok: true, traceOwner: o });
  assert.deepEqual(api.getActionTraceTabs()[0].events.map((event) => event.message), ["first", "different"]);
});
