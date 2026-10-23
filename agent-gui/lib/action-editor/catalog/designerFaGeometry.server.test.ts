import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mock, test } from "node:test";
import { POST } from "../../../app/api/fa/resolve/route";
import { parseActionProjectBinding, type ActionProjectBinding } from "../../action-project-binding";
import { withDesignerCatalogContext, type DesignerCatalogScope } from "./designerCatalogContext";

const actionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const spec = "fa:Light_Fixture:#123456";
const base = "http://icon-fixture.invalid:19477";
const binding = (letter: string): ActionProjectBinding => parseActionProjectBinding({ schemaVersion: 1, kind: "action", actionId,
  hostBinding: { hostInstanceId: `instance-${letter}`, hostSessionId: letter.repeat(32), endpoint: `QuickerRpc_User_${"C".repeat(24)}_${letter.repeat(32)}`,
    protocolVersion: 1, schemaVersion: 1, hostKind: "v1", quickerVersion: "fixture", capabilities: {}, future: { extension: letter } } }, actionId);
const a = binding("a"), b = binding("b");
type Invoke = { op: string; args: { specs: string[] }; hostBinding: ActionProjectBinding["hostBinding"] };
function request(scope: DesignerCatalogScope, signal?: AbortSignal) {
  return new Request("http://fixture.invalid/api/fa/resolve", { method: "POST", signal, headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withDesignerCatalogContext({ specs: [spec] }, scope)) });
}
const reply = (invoke: Invoke) => ({ ok: true, action: "fa-resolve", payload: { success: true,
  items: [{ spec, enumName: "Light_Fixture", path: invoke.hostBinding.hostInstanceId, width: 37, height: 19, color: "#123456" }], errors: ["per-spec fixture warning"] } });

async function fixture(run: (data: { scope: (binding: ActionProjectBinding) => NonNullable<DesignerCatalogScope>; path: (binding: ActionProjectBinding) => string; root: string }) => Promise<void>, fetcher: typeof fetch) {
  const parent = fileURLToPath(new URL("../../../../.tmp/designer-bound-icons/", import.meta.url));
  await mkdir(parent, { recursive: true }); const root = await mkdtemp(join(parent, "fixture-"));
  const scope = (record: ActionProjectBinding) => ({ cwd: root, projectDirectory: `.quicker/actions/${record.hostBinding.hostInstanceId}`, expectedProjectBinding: record });
  const path = (record: ActionProjectBinding) => join(root, scope(record).projectDirectory, ".qkrpc/project-binding.json");
  for (const record of [a, b]) {
    await mkdir(join(root, scope(record).projectDirectory, ".qkrpc"), { recursive: true });
    await writeFile(path(record), JSON.stringify(record));
    await writeFile(join(root, scope(record).projectDirectory, "info.json"), JSON.stringify({ id: actionId, title: "fixture" }));
    await writeFile(join(root, scope(record).projectDirectory, "data.json"), '{"steps":[],"opaque":9223372036854775807}');
  }
  const overrides: Record<string, string | undefined> = { QKRPC_HTTP_URL: base, QKRPC_TRANSPORT: "http", QKRPC_HOST_BINDING: undefined, QKRPC_HOST_SESSION: undefined };
  const old = new Map(Object.keys(overrides).map((key) => [key, process.env[key]])); const oldFetch = globalThis.fetch;
  for (const [key, value] of Object.entries(overrides)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  globalThis.fetch = fetcher;
  const spawn = mock.method(childProcess, "spawn", () => { throw new Error("Icon fixture forbids CLI fallback"); }); syncBuiltinESMExports();
  try { await run({ scope, path, root }); }
  finally {
    globalThis.fetch = oldFetch; spawn.mock.restore(); syncBuiltinESMExports();
    for (const [key, value] of old) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    assert.ok(root.startsWith(join(parent, "fixture-"))); await rm(root, { recursive: true, force: true });
  }
}

test("FA route rejects loading, unbound, mismatched, invalid and pre-aborted document targets without any host calls", async () => {
  let calls = 0;
  await fixture(async ({ scope, path }) => {
    await writeFile(path(a), JSON.stringify({ ...a, hostBinding: { ...a.hostBinding, future: { changed: true } } }));
    for (const [context, code] of [[null, "PROJECT_IDENTITY_LOADING"], [{ ...scope(a), expectedProjectBinding: null }, "HOST_BINDING_REQUIRED"], [scope(a), "PROJECT_IDENTITY_CONFLICT"]] as const) {
      const response = await POST(request(context)); assert.equal(response.status, 409); assert.equal((await response.json()).code, code);
    }
    const aborted = new AbortController(); aborted.abort(new Error("icon cancelled"));
    const response = await POST(request(scope(a), aborted.signal)); assert.equal(response.status, 499); assert.equal((await response.json()).error, "icon cancelled");
    const invalid = await POST(new Request("http://fixture.invalid/api/fa/resolve", { method: "POST", body: '{"catalogContext":{}}' }));
    assert.equal(invalid.status, 400); assert.equal((await invalid.json()).code, "INVALID_CATALOG_CONTEXT"); assert.equal(calls, 0);
  }, async () => { calls++; throw new Error("Unexpected host"); });
});

test("concurrent FA requests use complete exact bindings and preserve geometry plus per-spec errors", async () => {
  const calls: Invoke[] = [];
  await fixture(async ({ scope }) => {
    const results = await Promise.all([a, b].map(async (record) => {
      const response = await POST(request(scope(record))); assert.equal(response.status, 200);
      const body = await response.json(); assert.equal(body.items[0].path, record.hostBinding.hostInstanceId);
      assert.equal(body.items[0].width, 37); assert.equal(body.items[0].height, 19); assert.equal(body.items[0].color, "#123456");
      assert.deepEqual(body.errors, ["per-spec fixture warning"]);
    })); assert.equal(results.length, 2); assert.equal(calls.length, 2);
  }, async (url, init) => {
    assert.equal(String(url), `${base}/v1/invoke`); const invoke: Invoke = JSON.parse(String(init?.body));
    assert.equal(invoke.op, "fa.resolve"); assert.deepEqual(invoke.args.specs, [spec]);
    assert.deepEqual(invoke.hostBinding, invoke.hostBinding.hostInstanceId === "instance-a" ? a.hostBinding : b.hostBinding);
    calls.push(invoke); return Response.json({ ok: true, data: reply(invoke) });
  });
});

test("FA late target changes and cancellation reject rather than returning another owner's geometry", async () => {
  let change!: () => Promise<void>;
  await fixture(async ({ scope, path, root }) => {
    change = () => writeFile(path(a), JSON.stringify({ ...a, hostBinding: { ...a.hostBinding, quickerVersion: "changed" } }));
    const response = await POST(request(scope(a))); assert.equal(response.status, 409); assert.equal((await response.json()).code, "PROJECT_IDENTITY_CONFLICT");
    assert.equal(await readFile(join(root, scope(a).projectDirectory, "data.json"), "utf8"), '{"steps":[],"opaque":9223372036854775807}');
  }, async (_url, init) => { await change(); return Response.json({ ok: true, data: reply(JSON.parse(String(init?.body))) }); });
  const controller = new AbortController(); let calls = 0;
  await fixture(async ({ scope }) => {
    const response = await POST(request(scope(a), controller.signal)); assert.equal(response.status, 499); assert.equal((await response.json()).error, "late icon abort"); assert.equal(calls, 1);
  }, async (_url, init) => { calls++; controller.abort(new Error("late icon abort")); return Response.json({ ok: true, data: reply(JSON.parse(String(init?.body))) }); });
});

test("bound FA failures retain code and never discover a substitute; absent context retains legacy resolve", async () => {
  let calls = 0;
  await fixture(async ({ scope }) => {
    const failed = await POST(request(scope(a))); assert.equal(failed.status, 503);
    const failure = await failed.json(); assert.equal(failure.code, "CATALOG_REQUEST_FAILED"); assert.equal(failure.retryable, false); assert.equal(calls, 1);
  }, async () => { calls++; return Response.json({ ok: true, data: { ok: false, payload: { success: false, errorMessage: "V2 FA adapter unavailable" } } }); });
  await fixture(async () => {
    process.env.QKRPC_HOST_BINDING = JSON.stringify(a.hostBinding);
    const response = await POST(request(undefined)); assert.equal(response.status, 200); assert.equal((await response.json()).items[0].path, "legacy");
  }, async (_url, init) => {
    const invoke: Invoke = JSON.parse(String(init?.body));
    assert.equal(invoke.op, "fa.resolve", "legacy absent scope retains its explicit global target");
    const data = reply(invoke); data.payload.items[0].path = "legacy";
    return Response.json({ ok: true, data });
  });
});
