import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fsPromises from "node:fs/promises";
import { existsSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile, link, symlink } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { mock, test } from "node:test";
import { POST } from "../app/api/designer/resources/open-action/route";
import { openDesignerResourceAction } from "./designer-resource-action-open.server";
import type { DesignerResourceActionOpenRequest, DesignerResourceActionOpenResult } from "./designer-resource-action-open";
import { parseActionProjectBinding, type ActionProjectBinding } from "./action-project-binding";
import { workspaceDocumentKey } from "./workspace-document-instances";
import { previewTabId } from "./workbench/preview-tab-id";
import { getRequestAbortSignal, getRequestCwd } from "./qkrpc-request-context";
import type { QkrpcRunResult } from "./qkrpc-types";

const sourceId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", targetId = "11111111-2222-3333-4444-555555555555";
const nextId = "99999999-8888-7777-6666-555555555555";
const requestId = "12345678-1234-1234-1234-123456789012", requestTwo = "12345678-1234-1234-1234-123456789013";
const sourceDirectory = ".quicker/actions/source", base = "http://resource-open-fixture.invalid:19477";
const body = '{"steps":[],"opaque":9223372036854775807}';
const bind = (letter = "a", id = sourceId, change: object = {}): ActionProjectBinding => parseActionProjectBinding({ schemaVersion: 1, kind: "action", actionId: id,
  hostBinding: { hostInstanceId: `instance-${letter}`, hostSessionId: letter.repeat(32), endpoint: `QuickerRpc_User_${"C".repeat(24)}_${letter.repeat(32)}`,
    protocolVersion: 1, schemaVersion: 1, hostKind: "v1", quickerVersion: "fixture", capabilities: { "resource.action.page.read": true, "action.legacyBody.read": true }, ...change } }, id);
const missingRun = async (): Promise<QkrpcRunResult> => { throw new Error("A local-only case must not dispatch an export"); };

async function fixture(run: (f: Fixture) => Promise<void>): Promise<void> {
  const parent = resolve(process.cwd(), "../.tmp/designer-resource-open-fixtures"); await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "fixture-"));
  const overrides: Record<string, string | undefined> = { QKRPC_HTTP_URL: base, QKRPC_TRANSPORT: "http", QKRPC_HOST_BINDING: undefined, QKRPC_HOST_SESSION: undefined };
  const old = new Map(Object.keys(overrides).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(overrides)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  const f = new Fixture(root);
  try { await f.project(sourceDirectory, bind()); await run(f); }
  finally {
    for (const [key, value] of old) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    assert.ok(root.startsWith(parent + sep)); await rm(root, { recursive: true, force: true });
  }
}
class Fixture {
  constructor(readonly root: string) { }
  request(record = bind(), id = targetId, operationId = requestId, directory = sourceDirectory): DesignerResourceActionOpenRequest {
    const path = `${directory}/data.json`, tabId = previewTabId("file", path);
    return { actionId: id, requestId: operationId, sourceOwner: { cwd: this.root, path, tabId, key: workspaceDocumentKey(this.root, tabId), instanceId: 1 },
      catalogContext: { cwd: this.root, projectDirectory: directory, expectedProjectBinding: record } };
  }
  target(id = targetId, record = bind()): ActionProjectBinding { return { ...record, actionId: id }; }
  async project(directory: string, record: ActionProjectBinding) {
    await mkdir(join(this.root, directory, ".qkrpc"), { recursive: true });
    await writeFile(join(this.root, directory, "info.json"), JSON.stringify({ id: record.actionId, title: "fixture" }));
    await writeFile(join(this.root, directory, "data.json"), body);
    // C# commits provenance last, after writing the complete project.
    await writeFile(join(this.root, directory, ".qkrpc/project-binding.json"), JSON.stringify(record));
  }
  async exported(args: string[], record = bind()): Promise<QkrpcRunResult> {
    assert.deepEqual(args.slice(0, 2), ["action", "extract"]); assert.equal(args.at(-1), "--no-bootstrap");
    const absolute = args[args.indexOf("--dir") + 1], id = args[args.indexOf("--id") + 1];
    assert.ok(absolute.startsWith(join(this.root, ".quicker/actions/open-")));
    assert.deepEqual(await readdir(absolute), [], "Only C# may claim/export this empty directory.");
    const directory = absolute.slice(this.root.length + 1).replace(/\\/g, "/");
    await this.project(directory, this.target(id, record));
    return { ok: true, exitCode: 0, stdout: "", stderr: "", truncated: false,
      parsed: { ok: true, action: "action-extract", payload: { success: true, actionId: id, projectDirectory: directory, projectDirectoryAbsolute: absolute } } };
  }
  claim(id = requestId) { return join(this.root, `.quicker/.resource-open-requests/${id}.json`); }
}
function success(result: DesignerResourceActionOpenResult) { assert.equal(result.ok, true, JSON.stringify(result)); if (!result.ok) throw new Error(result.error); return result; }
function failure(result: DesignerResourceActionOpenResult, code: string) { assert.equal(result.ok, false); if (result.ok) throw new Error("Expected failure"); assert.equal(result.code, code); assert.equal(result.retryable, false); return result; }
const pendingOwners = () => (globalThis as Record<symbol, Map<string, Promise<unknown>>>)[Symbol.for("qkrpc.designerResourceActionOpenOwners.v2")];
async function until(check: () => boolean) {
  const deadline = Date.now() + 2_000;
  while (!check() && Date.now() < deadline) await new Promise<void>((done) => setImmediate(done));
  assert.ok(check(), "The owned request did not reach the fixture barrier.");
}

test("open validates explicit source cwd/file owner, request ids and cancellation before transport", async () => fixture(async (f) => {
  const valid = f.request();
  for (const bad of [undefined, {}, { ...valid, actionId: "not-guid" }, { ...valid, requestId: "../unsafe" },
    { ...valid, catalogContext: undefined }, { ...valid, catalogContext: { ...valid.catalogContext, cwd: undefined } },
    { ...valid, catalogContext: { ...valid.catalogContext, cwd: "relative" } }, { ...valid, sourceOwner: undefined },
    { ...valid, sourceOwner: { ...valid.sourceOwner, instanceId: 0 } }, { ...valid, sourceOwner: { ...valid.sourceOwner, key: "other" } },
    { ...valid, sourceOwner: { ...valid.sourceOwner, path: ".quicker/actions/other/data.json" } }]) {
    const result = await openDesignerResourceAction(bad, { run: missingRun }); assert.equal(result.ok, false);
  }
  const abort = new AbortController(); abort.abort(new Error("cancel before open"));
  failure(await openDesignerResourceAction(valid, { signal: abort.signal, run: missingRun }), "REQUEST_ABORTED");
  assert.deepEqual(await readdir(join(f.root, ".quicker/actions")), ["source"]);
}));

test("directory-read capability cannot grant export and V2 remains explicitly unsupported", async () => fixture(async (f) => {
  for (const changed of [{ capabilities: { "resource.action.page.read": true } }, { capabilities: { "action.legacyBody.read": false } }, { hostKind: "v2" }]) {
    const record = bind("a", sourceId, changed); await f.project(sourceDirectory, record);
    failure(await openDesignerResourceAction(f.request(record), { run: missingRun }), "UNSUPPORTED_HOST");
  }
  assert.deepEqual(await readdir(join(f.root, ".quicker")), ["actions"]);
}));

test("a unique exact-bound local project is reused without reload/export; foreign id matches are ignored", async () => fixture(async (f) => {
  await f.project(".quicker/actions/foreign-first", f.target(targetId, bind("b")));
  await f.project(".quicker/actions/local", f.target());
  const result = success(await openDesignerResourceAction(f.request(), { run: missingRun }));
  assert.equal(result.projectDirectory, ".quicker/actions/local"); assert.equal(result.origin, "existing"); assert.equal(result.localPersistence, "unchanged");
  assert.equal(await readFile(join(f.root, result.path), "utf8"), body);
  assert.equal(await readFile(join(f.root, sourceDirectory, "data.json"), "utf8"), body);
  // Rechecking an unchanged local project needs neither a new claim nor an export output directory.
  const repeated = success(await openDesignerResourceAction(f.request(), { run: missingRun }));
  assert.equal(repeated.origin, "existing"); assert.equal(repeated.localPersistence, "unchanged");
  assert.equal(repeated.projectDirectory, result.projectDirectory);
  assert.equal(await readFile(join(f.root, repeated.path), "utf8"), body);
  assert.equal(existsSync(join(f.root, `.quicker/actions/open-${requestId}`)), false);
  assert.equal(success(await openDesignerResourceAction(f.request(bind(), targetId, requestTwo), { run: missingRun })).origin, "existing");
}));

test("ambiguous local projects and complete binding differences never choose an arbitrary file", async () => fixture(async (f) => {
  await f.project(".quicker/actions/one", f.target()); await f.project(".quicker/actions/two", f.target());
  failure(await openDesignerResourceAction(f.request(), { run: missingRun }), "PROJECT_SELECTION_REQUIRED");
}));

test("same transport destination with changed full metadata is refused before export", async () => fixture(async (f) => {
  await f.project(".quicker/actions/local", f.target(targetId, bind("a", sourceId, { quickerVersion: "different" })));
  failure(await openDesignerResourceAction(f.request(), { run: missingRun }), "PROJECT_IDENTITY_CONFLICT");
}));

test("new exports use empty owned directories, exact full binding and a confirmed local receipt", async () => fixture(async (f) => {
  let calls = 0;
  const result = success(await openDesignerResourceAction(f.request(), { run: async (args, options) => {
    calls++; assert.deepEqual(options?.hostBinding, bind().hostBinding); assert.equal(options?.timeoutMs, 30_000);
    return f.exported(args);
  } }));
  assert.equal(result.origin, "exported"); assert.equal(result.localPersistence, "confirmed"); assert.equal(result.projectDirectory, `.quicker/actions/open-${requestId}`);
  const claim = JSON.parse(await readFile(f.claim(), "utf8")); assert.equal(claim.cwd, await import("node:fs/promises").then((fs) => fs.realpath(f.root)));
  assert.deepEqual(claim.sourceOwner, f.request().sourceOwner); assert.deepEqual(claim.target, f.target());
  const recovered = success(await openDesignerResourceAction(f.request(), { run: missingRun }));
  assert.equal(recovered.origin, "recovered"); assert.equal(recovered.localPersistence, "confirmed"); assert.equal(calls, 1);
}));

test("immutable request claims reject changed action, full target, source project and source instance", async () => fixture(async (f) => {
  success(await openDesignerResourceAction(f.request(), { run: (args) => f.exported(args) }));
  for (const altered of [{ ...f.request(), actionId: nextId }, { ...f.request(), sourceOwner: { ...f.request().sourceOwner, instanceId: 2 } }])
    failure(await openDesignerResourceAction(altered, { run: missingRun }), "REQUEST_ID_CONFLICT");
  await f.project(".quicker/actions/source-two", bind());
  failure(await openDesignerResourceAction(f.request(bind(), targetId, requestId, ".quicker/actions/source-two"), { run: missingRun }), "REQUEST_ID_CONFLICT");
  const changed = bind("a", sourceId, { quickerVersion: "new complete binding" }); await f.project(sourceDirectory, changed);
  failure(await openDesignerResourceAction(f.request(changed), { run: missingRun }), "REQUEST_ID_CONFLICT");
}));

test("a copied claim cannot transfer ownership to another cwd and hard-linked metadata is refused", async () => fixture(async (f) => {
  success(await openDesignerResourceAction(f.request(), { run: (args) => f.exported(args) }));
  await fixture(async (other) => {
    await mkdir(join(other.root, ".quicker/.resource-open-requests"));
    await writeFile(other.claim(), await readFile(f.claim()));
    failure(await openDesignerResourceAction(other.request(), { run: missingRun }), "REQUEST_ID_CONFLICT");
  });
  await link(f.claim(), f.claim(requestTwo));
  failure(await openDesignerResourceAction(f.request(), { run: missingRun }), "UNSAFE_PROJECT_PATH");
}));

test("request claim parents cannot redirect through a symlink or junction", async () => fixture(async (f) => {
  const redirect = join(f.root, "redirect"); await mkdir(redirect);
  await symlink(redirect, join(f.root, ".quicker/.resource-open-requests"), "junction");
  failure(await openDesignerResourceAction(f.request(), { run: missingRun }), "UNSAFE_PROJECT_PATH");
  assert.deepEqual(await readdir(redirect), []);
}));

test("partial or unconfirmed output is retained and the same request never replays export", async () => fixture(async (f) => {
  let calls = 0;
  const result = failure(await openDesignerResourceAction(f.request(), { run: async (args) => {
    calls++; const absolute = args[args.indexOf("--dir") + 1]; await writeFile(join(absolute, "data.json"), body);
    return { ok: false, exitCode: 1, stdout: "", stderr: "reply lost", parsed: null, truncated: false };
  } }), "OPEN_RESULT_UNKNOWN");
  assert.equal(result.localPersistence, "unknown");
  failure(await openDesignerResourceAction(f.request(), { run: missingRun }), "OPEN_RESULT_UNKNOWN");
  assert.equal(calls, 1); assert.equal(await readFile(join(f.root, result.projectDirectory!, "data.json"), "utf8"), body);
}));

test("acknowledgement loss can recover only the exact committed sidecar/info/body; partial facts survive", async () => fixture(async (f) => {
  failure(await openDesignerResourceAction(f.request(), { run: async (args) => {
    await f.exported(args); return { ok: false, exitCode: 1, stdout: "", stderr: "lost", parsed: { error: "WRITE_RESULT_UNKNOWN" }, truncated: false };
  } }), "WRITE_RESULT_UNKNOWN");
  assert.equal(success(await openDesignerResourceAction(f.request(), { run: missingRun })).origin, "recovered");
  const partial = failure(await openDesignerResourceAction(f.request(bind(), nextId, requestTwo), { run: async () => ({ ok: false, exitCode: 1,
    stdout: "", stderr: "binding not committed", truncated: false, parsed: { error: "PROJECT_BINDING_WRITE_FAILED", data: { persistedParts: { localProject: true, binding: false } } } }) }), "PROJECT_BINDING_WRITE_FAILED");
  assert.equal(partial.localPersistence, "partial"); assert.deepEqual(partial.persistedParts, { localProject: true, binding: false });
}));

test("request abort after dispatch does not overwrite confirmed export or cancel the bounded operation owner", async () => fixture(async (f) => {
  const abort = new AbortController();
  const result = success(await openDesignerResourceAction(f.request(), { signal: abort.signal, run: async (args) => {
    const owned = getRequestAbortSignal(); assert.ok(owned); assert.notEqual(owned, abort.signal);
    abort.abort(new Error("view closed")); assert.equal(owned.aborted, false); return f.exported(args);
  } }));
  assert.equal(result.localPersistence, "confirmed");
}));

test("cancellation after the claim and empty directory exist still prevents the actual transport call", async () => fixture(async (f) => {
  const abort = new AbortController(), reason = new Error("source closed before transport dispatch");
  const original = abort.signal.throwIfAborted.bind(abort.signal);
  const output = join(f.root, `.quicker/actions/open-${requestId}`);
  Object.defineProperty(abort.signal, "throwIfAborted", { value() {
    if (existsSync(output)) abort.abort(reason);
    original();
  } });
  let calls = 0;
  const result = failure(await openDesignerResourceAction(f.request(), { signal: abort.signal, run: async () => { calls++; return missingRun(); } }), "REQUEST_ABORTED");
  assert.equal(abort.signal.reason, reason); assert.equal(calls, 0); assert.equal(result.localPersistence, "none");
  assert.match(result.error, /source closed before transport dispatch/);
  assert.equal(existsSync(f.claim()), true); assert.deepEqual(await readdir(output), []);
}));

test("a source binding change after confirmed export keeps the local receipt and cannot silently open it", async () => fixture(async (f) => {
  const result = failure(await openDesignerResourceAction(f.request(), { run: async (args) => {
    const exported = await f.exported(args); await f.project(sourceDirectory, bind("b")); return exported;
  } }), "PROJECT_IDENTITY_CONFLICT");
  assert.equal(result.localPersistence, "confirmed"); assert.deepEqual(result.persistedParts, { localProject: true, binding: true });
  assert.equal(await readFile(join(f.root, result.projectDirectory!, "data.json"), "utf8"), body);
}));

test("claim replacement after export retains confirmed files but rejects the changed request owner", async () => fixture(async (f) => {
  const result = failure(await openDesignerResourceAction(f.request(), { run: async (args) => {
    const exported = await f.exported(args);
    const claim = JSON.parse(await readFile(f.claim(), "utf8")); claim.sourceOwner.instanceId++;
    await writeFile(f.claim(), JSON.stringify(claim)); return exported;
  } }), "REQUEST_ID_CONFLICT");
  assert.equal(result.localPersistence, "confirmed"); assert.deepEqual(result.persistedParts, { localProject: true, binding: true });
  assert.equal(await readFile(join(f.root, result.projectDirectory!, "data.json"), "utf8"), body);
}));

test("concurrent opens serialize per complete target and reuse the first project without a second export", async () => fixture(async (f) => {
  let begin!: () => void, finish!: () => void, calls = 0;
  const started = new Promise<void>((resolveStarted) => { begin = resolveStarted; }), wait = new Promise<void>((resolveWait) => { finish = resolveWait; });
  const first = openDesignerResourceAction(f.request(), { run: async (args) => { calls++; begin(); await wait; return f.exported(args); } });
  await started;
  const second = openDesignerResourceAction(f.request(bind(), targetId, requestTwo), { run: missingRun });
  finish(); const [one, two] = await Promise.all([first, second]);
  assert.equal(success(one).origin, "exported"); assert.equal(success(two).origin, "existing");
  assert.equal(success(one).path, success(two).path); assert.equal(calls, 1);
}));

test("queued different owners retain their own non-dispatch fact and explicitly associate the original unknown or partial receipt", async () => fixture(async (f) => {
  await f.project(".quicker/actions/another-source", bind());
  for (const partial of [false, true]) {
    const id = partial ? nextId : targetId;
    const operationIds = partial ? ["bbbbbbbb-1111-2222-3333-444444444441", "bbbbbbbb-1111-2222-3333-444444444442", "bbbbbbbb-1111-2222-3333-444444444443"]
      : [requestId, requestTwo, "12345678-1234-1234-1234-123456789014"];
    let begin!: () => void, finish!: () => void, calls = 0;
    const started = new Promise<void>((done) => { begin = done; }), wait = new Promise<void>((done) => { finish = done; });
    const firstRequest = f.request(bind(), id, operationIds[0]);
    const secondRequest = f.request(bind(), id, operationIds[1], ".quicker/actions/another-source");
    const thirdRequest = { ...secondRequest, requestId: operationIds[2], sourceOwner: { ...secondRequest.sourceOwner, instanceId: 2 } };
    const first = openDesignerResourceAction(firstRequest, { run: async () => {
      calls++; begin(); await wait;
      return { ok: false, exitCode: 1, stdout: "", stderr: "original export acknowledgement lost", truncated: false,
        parsed: { error: "WRITE_RESULT_UNKNOWN", ...(partial ? { data: { persistedParts: { localProject: true, binding: false } } } : {}) } };
    } });
    await started;
    const firstHeld = [...pendingOwners().values()][0];
    const second = openDesignerResourceAction(secondRequest, { run: missingRun });
    let third: Promise<DesignerResourceActionOpenResult> | undefined;
    try {
      await until(() => [...pendingOwners().values()][0] !== firstHeld);
      const secondHeld = [...pendingOwners().values()][0];
      third = openDesignerResourceAction(thirdRequest, { run: missingRun });
      await until(() => [...pendingOwners().values()][0] !== secondHeld);
    } catch (error) {
      finish(); await Promise.allSettled([first, second, third]); throw error;
    } finally { finish(); }
    const [one, two, three] = await Promise.all([first, second, third!]);
    const original = failure(one, "WRITE_RESULT_UNKNOWN");
    assert.equal(original.localPersistence, partial ? "partial" : "unknown");
    for (const [request, result] of [[secondRequest, two], [thirdRequest, three]] as const) {
      const blocked = failure(result, "RESOURCE_OPEN_BLOCKED");
      assert.equal(blocked.localPersistence, "none"); assert.equal(blocked.projectDirectory, undefined); assert.equal(blocked.persistedParts, undefined);
      assert.deepEqual(blocked.blockedBy, { requestId: firstRequest.requestId, actionId: id, sourceOwner: firstRequest.sourceOwner,
        code: original.code, error: original.error, projectDirectory: original.projectDirectory, localPersistence: original.localPersistence,
        ...(partial ? { persistedParts: { localProject: true, binding: false } } : {}) });
      assert.equal(existsSync(f.claim(request.requestId)), false); assert.equal(existsSync(join(f.root, `.quicker/actions/open-${request.requestId}`)), false);
    }
    assert.equal(calls, 1);
  }
}));

test("a cancelled queued waiter cannot discard the preceding unknown receipt and permit a later export", async () => fixture(async (f) => {
  let begin!: () => void, finish!: () => void, calls = 0;
  const started = new Promise<void>((done) => { begin = done; }), wait = new Promise<void>((done) => { finish = done; });
  const abort = new AbortController(), reason = new Error("second source closed while queued");
  const first = openDesignerResourceAction(f.request(), { run: async () => {
    calls++; begin(); await wait; return { ok: false, exitCode: 1, stdout: "", stderr: "first export receipt lost", parsed: null, truncated: false };
  } });
  await started;
  const firstHeld = [...pendingOwners().values()][0];
  const second = openDesignerResourceAction(f.request(bind(), targetId, requestTwo), { signal: abort.signal, run: missingRun });
  let third: Promise<DesignerResourceActionOpenResult> | undefined;
  const thirdId = "12345678-1234-1234-1234-123456789014";
  try {
    await until(() => [...pendingOwners().values()][0] !== firstHeld);
    const secondHeld = [...pendingOwners().values()][0];
    third = openDesignerResourceAction(f.request(bind(), targetId, thirdId), { run: missingRun });
    await until(() => [...pendingOwners().values()][0] !== secondHeld);
    abort.abort(reason);
  } catch (error) {
    finish(); await Promise.allSettled([first, second, third]); throw error;
  } finally { finish(); }
  const [one, two, three] = await Promise.all([first, second, third!]);
  const original = failure(one, "OPEN_RESULT_UNKNOWN");
  const cancelled = failure(two, "REQUEST_ABORTED"); assert.equal(cancelled.localPersistence, "none"); assert.equal(cancelled.error, reason.message);
  const blocked = failure(three, "RESOURCE_OPEN_BLOCKED"); assert.equal(blocked.localPersistence, "none");
  assert.equal(blocked.blockedBy?.requestId, requestId); assert.equal(blocked.blockedBy?.projectDirectory, original.projectDirectory);
  assert.equal(existsSync(f.claim(requestTwo)), false); assert.equal(existsSync(f.claim(thirdId)), false); assert.equal(calls, 1);
}));

test("distinct case-sensitive canonical workspace entities never share an inflight export or receipt", async () => fixture(async (one) => fixture(async (two) => {
  // The physical fixture roots are separate on any filesystem. Simulate canonical entity names from a
  // case-sensitive Windows directory; path guards continue to inspect each real physical fixture.
  const realpath = fsPromises.realpath;
  const canonical = new Map([[one.root, resolve(one.root, "../CaseWorkspace")], [two.root, resolve(one.root, "../caseWorkspace")]]);
  const probe = mock.method(fsPromises, "realpath", async (path, ...args) => !getRequestCwd() && canonical.has(String(path))
    ? canonical.get(String(path))! : realpath(path, ...args));
  syncBuiltinESMExports();
  let begin!: () => void, finish!: () => void, calls = 0;
  const started = new Promise<void>((done) => { begin = done; }), wait = new Promise<void>((done) => { finish = done; });
  let first: Promise<DesignerResourceActionOpenResult> | undefined, second: Promise<DesignerResourceActionOpenResult> | undefined;
  try {
    first = openDesignerResourceAction(one.request(), { run: async () => {
      begin(); await wait; return { ok: false, exitCode: 1, stdout: "", stderr: "first workspace lost its receipt", truncated: false, parsed: null };
    } });
    await started;
    second = openDesignerResourceAction(two.request(), { run: async (args) => { calls++; return two.exported(args); } });
    await until(() => calls === 1);
    const opened = success(await second); assert.equal(opened.origin, "exported");
    assert.equal(await readFile(join(two.root, opened.path), "utf8"), body);
    assert.equal(existsSync(join(one.root, opened.path, "data.json")), false);
    finish(); assert.equal(failure(await first, "OPEN_RESULT_UNKNOWN").localPersistence, "unknown");
  } finally {
    finish(); await Promise.allSettled([first, second]); probe.mock.restore(); syncBuiltinESMExports();
  }
})));

test("the actual API preserves an unknown HTTP export result and never falls back to a CLI child", async () => fixture(async (f) => {
  let calls = 0; const originalFetch = globalThis.fetch;
  const spawn = mock.method(childProcess, "spawn", () => { throw new Error("No CLI fallback is permitted"); }); syncBuiltinESMExports();
  globalThis.fetch = async (url, init) => {
    calls++; assert.equal(String(url), `${base}/v1/invoke`);
    const invoke = JSON.parse(String(init?.body)); assert.equal(invoke.op, "action.extract"); assert.deepEqual(invoke.hostBinding, bind().hostBinding);
    return new Response("");
  };
  const req = () => new Request("http://fixture.invalid/api/designer/resources/open-action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f.request()) });
  try {
    const first = await POST(req()); assert.equal(first.status, 503); const result = failure(await first.json(), "WRITE_RESULT_UNKNOWN");
    assert.equal(result.localPersistence, "unknown"); assert.equal(result.projectDirectory, `.quicker/actions/open-${requestId}`);
    failure(await (await POST(req())).json(), "OPEN_RESULT_UNKNOWN");
    assert.equal(calls, 1); assert.equal(spawn.mock.callCount(), 0);
  } finally { globalThis.fetch = originalFetch; spawn.mock.restore(); syncBuiltinESMExports(); }
}));
