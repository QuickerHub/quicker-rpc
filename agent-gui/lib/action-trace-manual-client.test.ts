import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
type Api = typeof import("./action-trace-client") & typeof import("./action-trace-overlay");
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
const binding = { hostInstanceId: "manual-client", hostSessionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", endpoint: "QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", protocolVersion: 1, schemaVersion: 1, hostKind: "v1", quickerVersion: "fixture", capabilities: {} };
const actionId = "11111111-1111-4111-8111-111111111111";
const owner = (runId: string, cwd = "cwd-A") => ({ version: 1, runId, executionId: `execution-${runId}`, threadId: `manual:execution-${runId}`, cwd, actionId, hostBinding: binding, invocationPath: [] });
async function fixture() {
  const focus: string[] = []; (globalThis as unknown as { manualTraceFocus: string[] }).manualTraceFocus = focus;
  const result = await build({ stdin: { contents: 'export * from "./action-trace-client"; export * from "./action-trace-overlay";', resolveDir: dirname(fileURLToPath(import.meta.url)), loader: "ts" }, bundle: true, write: false, platform: "node", format: "cjs", plugins: [{ name: "inert-boundaries", setup(b) {
    b.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "inert" }));
    b.onResolve({ filter: /^(?:@\/lib\/|\.\/)(workspace-explorer)$/ }, () => ({ path: "explorer", namespace: "inert" }));
    b.onLoad({ filter: /.*/, namespace: "inert" }, (args) => ({ contents: args.path === "react" ? "export function useSyncExternalStore(){}" : "export const workspaceExplorerActionsRef={current:{focusSidePanelView(id){globalThis.manualTraceFocus.push(id)},setActiveSideView(){}}}", loader: "js" }));
  } }] });
  const module = { exports: {} }; new Function("module", "exports", "require", result.outputFiles[0].text)(module, module.exports, createRequire(import.meta.url));
  const api = module.exports as Api; api.switchActionTraceThread("A");
  let active = "A";
  const port = (threadId: string, cwd = `cwd-${threadId}`) => ({ threadId, cwd, isCurrent: () => active === threadId });
  return { api, focus, port, activate(thread: string) { active = thread; api.switchActionTraceThread(thread); } };
}
test("late manual start ACK remains in its original thread/cwd and never focuses the next presentation", async () => {
  const { api, focus, port, activate } = await fixture(); const ack = deferred<Response>(); const oldFetch = globalThis.fetch;
  let posts = 0, feeds = 0;
  globalThis.fetch = async (url, init) => {
    if (init?.method === "POST") { posts++; assert.equal(JSON.parse(String(init.body)).cwd, "cwd-A"); return ack.promise; }
    feeds++; assert.equal(new URL(String(url), "http://fixture").searchParams.get("owner"), JSON.stringify(owner("A")));
    return new Response(`event: done\ndata: ${JSON.stringify({ ok: true, traceOwner: owner("A") })}\n\n`);
  };
  try {
    const pending = api.startActionTrace({ actionId, presentation: port("A") }); assert.equal(api.getActionTraceTabs().length, 1);
    activate("B"); const focused = focus.length; ack.resolve(Response.json({ ok: true, owner: owner("A") }));
    assert.deepEqual(await pending, { ok: true, presented: false }); assert.equal(api.getActionTraceTabs().length, 0); assert.equal(focus.length, focused);
    activate("A"); assert.equal(api.getActionTraceTabs().length, 1); assert.equal(api.getActionTraceTabs()[0].owner!.cwd, "cwd-A"); assert.equal(posts, 1); assert.equal(feeds, 1);
  } finally { globalThis.fetch = oldFetch; }
});
test("closed pending view ignores late ACK, never subscribes/reopens, and an ACK loss never retries POST", async () => {
  const { api, port } = await fixture(); const ack = deferred<Response>(); const oldFetch = globalThis.fetch; let posts = 0, feeds = 0; let signal: AbortSignal | undefined;
  globalThis.fetch = async (_url, init) => { if (init?.method !== "POST") { feeds++; return new Response(); } posts++; signal = init.signal!; return ack.promise; };
  try {
    const pending = api.startActionTrace({ actionId, presentation: port("A") }); const tab = api.getActionTraceTabs()[0]; api.closeActionTraceTab(tab.tabId);
    assert.equal(signal!.aborted, true); ack.resolve(Response.json({ ok: true, owner: owner("closed") }));
    assert.deepEqual(await pending, { ok: true, presented: false }); assert.equal(api.getActionTraceTabs().length, 0); assert.equal(feeds, 0); assert.equal(posts, 1);
    globalThis.fetch = async () => { posts++; throw Error("ACK disconnected after possible dispatch"); };
    const failed = await api.startActionTrace({ actionId, presentation: port("A") }); assert.equal(failed.ok, false); assert.equal(posts, 2);
    assert.equal(api.getActionTraceTabs()[0].resultUnknown, true); assert.match(api.getActionTraceTabs()[0].errorMessage!, /原生结果未知/);
  } finally { globalThis.fetch = oldFetch; }
});
test("confirmed close only stops its observer; separate clicks keep distinct owners and absent/hidden scopes do zero POST", async () => {
  const { api, port, activate } = await fixture(); const oldFetch = globalThis.fetch; let posts = 0; const feeds: AbortSignal[] = [];
  globalThis.fetch = async (_url, init) => {
    if (init?.method === "POST") return Response.json({ ok: true, owner: owner(String(++posts)) });
    feeds.push(init!.signal!); return new Response(new ReadableStream({ start(controller) { init!.signal!.addEventListener("abort", () => controller.error(init!.signal!.reason), { once: true }); } }));
  };
  try {
    await api.startActionTrace({ actionId, presentation: port("A") }); await api.startActionTrace({ actionId, presentation: port("A") });
    assert.equal(posts, 2); assert.equal(api.getActionTraceTabs().length, 2); assert.notEqual(api.getActionTraceTabs()[0].owner!.runId, api.getActionTraceTabs()[1].owner!.runId);
    api.closeActionTraceTab(api.getActionTraceTabs()[0].tabId); assert.equal(feeds[0].aborted, true); assert.equal(feeds[1].aborted, false);
    assert.equal((await api.startActionTrace({ actionId })).ok, false); activate("B"); assert.equal((await api.startActionTrace({ actionId, presentation: port("A") })).ok, false); assert.equal(posts, 2);
    activate("A"); api.closeActionTraceTab(api.getActionTraceTabs()[0].tabId);
  } finally { globalThis.fetch = oldFetch; }
});
test("a proven preparation rejection is a definite failure, while malformed or lost ACK remains unknown", async () => {
  const { api, port } = await fixture(); const oldFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ ok: false, code: "HOST_BINDING_REQUIRED", error: "Project is unbound", dispatchStatus: "not-dispatched", retryable: false }, { status: 409 }); };
  try {
    const result = await api.startActionTrace({ actionId, presentation: port("A") }); assert.equal(result.ok, false);
    assert.equal(api.getActionTraceTabs()[0].resultUnknown, false); assert.equal(api.getActionTraceTabs()[0].errorMessage, "Project is unbound"); assert.equal(calls, 1);
  } finally { globalThis.fetch = oldFetch; }
});
