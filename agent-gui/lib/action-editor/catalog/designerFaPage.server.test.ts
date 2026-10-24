import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mock, test } from "node:test";
import { POST } from "../../../app/api/fa/page/route";
import { parseActionProjectBinding, type ActionProjectBinding } from "../../action-project-binding";
import { withDesignerCatalogContext, type DesignerCatalogScope } from "./designerCatalogContext";

const actionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", base = "http://page-fixture.invalid:19477";
const binding = (letter: string): ActionProjectBinding => parseActionProjectBinding({ schemaVersion: 1, kind: "action", actionId,
  hostBinding: { hostInstanceId: `instance-${letter}`, hostSessionId: letter.repeat(32), endpoint: `QuickerRpc_User_${"C".repeat(24)}_${letter.repeat(32)}`,
    protocolVersion: 1, schemaVersion: 1, hostKind: "v1", quickerVersion: "fixture", capabilities: { "designer.fontAwesome.page.read": true }, future: { extension: letter } } }, actionId);
const a = binding("a"), b = binding("b");
const query = { query: "camera", style: "Brands", skip: 1, take: 2 };
const reply = (name: string) => ({ ok: true, action: "fa-page", payload: { success: true, ...query, names: [name, `${name}2`], totalCount: 5, hasMore: true } });
type Invoke = { op: string; args: typeof query; hostBinding: ActionProjectBinding["hostBinding"] };
function request(scope: DesignerCatalogScope, input: object = query, signal?: AbortSignal) {
  return new Request("http://fixture.invalid/api/fa/page", { method: "POST", signal,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(withDesignerCatalogContext(input, scope)) });
}
async function fixture(run: (data: { scope: (binding: ActionProjectBinding) => NonNullable<DesignerCatalogScope>; path: (binding: ActionProjectBinding) => string; root: string }) => Promise<void>, fetcher: typeof fetch) {
  const parent = fileURLToPath(new URL("../../../../.tmp/designer-bound-pages/", import.meta.url));
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
  const old = new Map(Object.keys(overrides).map((key) => [key, process.env[key]])), oldFetch = globalThis.fetch;
  for (const [key, value] of Object.entries(overrides)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  globalThis.fetch = fetcher;
  const spawn = mock.method(childProcess, "spawn", () => { throw new Error("Page fixture forbids CLI fallback"); }); syncBuiltinESMExports();
  try { await run({ scope, path, root }); }
  finally {
    globalThis.fetch = oldFetch; spawn.mock.restore(); syncBuiltinESMExports();
    for (const [key, value] of old) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    assert.ok(root.startsWith(join(parent, "fixture-"))); await rm(root, { recursive: true, force: true });
  }
}

test("paging has no legacy discovery: absent/loading/unbound/foreign/malformed/preabort all make zero host calls", async () => {
  let calls = 0;
  await fixture(async ({ scope, path }) => {
    await writeFile(path(a), JSON.stringify({ ...a, hostBinding: { ...a.hostBinding, future: { changed: true } } }));
    for (const [context, code] of [[undefined, "HOST_BINDING_REQUIRED"], [null, "PROJECT_IDENTITY_LOADING"],
      [{ ...scope(a), expectedProjectBinding: null }, "HOST_BINDING_REQUIRED"], [scope(a), "PROJECT_IDENTITY_CONFLICT"]] as const) {
      const response = await POST(request(context)); assert.equal(response.status, 409); assert.equal((await response.json()).code, code);
    }
    const invalid = await POST(request({} as NonNullable<DesignerCatalogScope>)); assert.equal(invalid.status, 400);
    const abort = new AbortController(); abort.abort(new Error("page already cancelled"));
    const stopped = await POST(request(scope(b), query, abort.signal)); assert.equal(stopped.status, 499);
    assert.equal((await stopped.json()).error, "page already cancelled"); assert.equal(calls, 0);
  }, async () => { calls++; throw new Error("Unexpected transport"); });
});

test("real route forwards normalized criteria to two exact full bindings with independent turn owners", async () => {
  const calls: Invoke[] = [];
  await fixture(async ({ scope }) => {
    await Promise.all([a, b].map(async (record) => {
      const response = await POST(request(scope(record), { query: " camera ", style: " brand ", skip: 1, take: 2 }));
      assert.equal(response.status, 200); const body = await response.json();
      assert.deepEqual(body, { ok: true, ...query, names: [record.hostBinding.hostInstanceId, `${record.hostBinding.hostInstanceId}2`], totalCount: 5, hasMore: true });
    })); assert.equal(calls.length, 2);
  }, async (url, init) => {
    assert.equal(String(url), `${base}/v1/invoke`); const invoke: Invoke = JSON.parse(String(init?.body));
    assert.equal(invoke.op, "fa.page"); assert.deepEqual(invoke.args, query);
    assert.deepEqual(invoke.hostBinding, invoke.hostBinding.hostInstanceId === "instance-a" ? a.hostBinding : b.hostBinding);
    calls.push(invoke); return Response.json({ ok: true, data: reply(invoke.hostBinding.hostInstanceId) });
  });
});

test("invalid request and inconsistent native page facts are rejected without a fallback", async () => {
  let calls = 0, change: object = {};
  await fixture(async ({ scope }) => {
    for (const input of [{ query: 7 }, { style: {} }, { skip: 0.5 }, { take: 2147483648 }]) {
      const invalid = await POST(request(scope(a), input)); assert.equal(invalid.status, 400); assert.equal((await invalid.json()).code, "INVALID_FA_PAGE_REQUEST");
    }
    assert.equal(calls, 0);
    for (const corrupt of [{ names: [] }, { query: "other" }, { style: "Light" }, { skip: 0 }, { take: 96 }, { totalCount: 1 }, { hasMore: false }]) {
      change = corrupt; const result = await POST(request(scope(a))); assert.equal(result.status, 503);
      assert.equal((await result.json()).code, "INVALID_FA_PAGE_RESPONSE");
    }
    assert.equal(calls, 7);
  }, async () => { calls++; const data = reply("fixture"); Object.assign(data.payload, change); return Response.json({ ok: true, data }); });
});

test("unsupported errors retain their structure; no static or other-host fallback is attempted", async () => {
  let calls = 0;
  await fixture(async ({ scope }) => {
    const result = await POST(request(scope(a))); assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), { ok: false, code: "UNSUPPORTED_HOST", error: "Page leaf unavailable", retryable: false }); assert.equal(calls, 1);
  }, async () => { calls++; return Response.json({ ok: false, error: "UNSUPPORTED_HOST", message: "Page leaf unavailable" }); });
});

test("late binding mutation and cancellation never publish the page or alter document content", async () => {
  let mutate!: () => Promise<void>;
  await fixture(async ({ scope, path, root }) => {
    mutate = () => writeFile(path(a), JSON.stringify({ ...a, hostBinding: { ...a.hostBinding, quickerVersion: "changed" } }));
    const result = await POST(request(scope(a))); assert.equal(result.status, 409); assert.equal((await result.json()).code, "PROJECT_IDENTITY_CONFLICT");
    assert.equal(await readFile(join(root, scope(a).projectDirectory, "data.json"), "utf8"), '{"steps":[],"opaque":9223372036854775807}');
  }, async () => { await mutate(); return Response.json({ ok: true, data: reply("late") }); });
  const abort = new AbortController(); let calls = 0;
  await fixture(async ({ scope }) => {
    const result = await POST(request(scope(a), query, abort.signal)); assert.equal(result.status, 499);
    assert.equal((await result.json()).error, "cancel this page"); assert.equal(calls, 1);
    const survivor = await POST(request(scope(b))); assert.equal(survivor.status, 200);
  }, async (_url, init) => {
    calls++; const invoke: Invoke = JSON.parse(String(init?.body));
    if (invoke.hostBinding.hostInstanceId === "instance-a") abort.abort(new Error("cancel this page"));
    return Response.json({ ok: true, data: reply(invoke.hostBinding.hostInstanceId) });
  });
});
