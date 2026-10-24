import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mock, test } from "node:test";
import { POST } from "../../../app/api/designer/resources/page/route";
import { parseActionProjectBinding, type ActionProjectBinding } from "../../action-project-binding";
import { withDesignerCatalogContext, type DesignerCatalogScope } from "./designerCatalogContext";

type Kind = "action" | "global_subprogram";
const actionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", base = "http://resource-page-fixture.invalid:19477";
const capabilities = { "resource.action.page.read": true, "resource.globalSubprogram.page.read": true };
const binding = (letter: string, allowed: Record<string, boolean> = capabilities): ActionProjectBinding => parseActionProjectBinding({ schemaVersion: 1, kind: "action", actionId,
  hostBinding: { hostInstanceId: `instance-${letter}`, hostSessionId: letter.repeat(32), endpoint: `QuickerRpc_User_${"C".repeat(24)}_${letter.repeat(32)}`,
    protocolVersion: 1, schemaVersion: 1, hostKind: "v1", quickerVersion: "fixture", capabilities: allowed, future: { extension: letter } } }, actionId);
const a = binding("a"), b = binding("b");
const query = (kind: Kind = "action") => ({ kind, scope: "runtimeCatalog", query: "camera", skip: 1, take: 2, expectedSnapshotId: "snap-a" });
const page = (kind: Kind, name: string) => ({ kind, scope: "runtimeCatalog", query: "camera", skip: 1, take: 2, snapshotId: "snap-a",
  items: [1, 2].map((index) => ({ id: `${name}-${index}`, title: `Camera ${index}`, description: "fixture", icon: "", editVersion: "9223372036854775807", actionType: null, callIdentifier: null })),
  totalCount: 5, hasMore: true });
const reply = (kind: Kind, name: string) => ({ ok: true, action: "resource-catalog-page", payload: { success: true, ...page(kind, name) } });

type Invoke = { op: string; args: ReturnType<typeof query>; hostBinding: ActionProjectBinding["hostBinding"] };
function request(scope: DesignerCatalogScope, input: object = query(), signal?: AbortSignal) {
  return new Request("http://fixture.invalid/api/designer/resources/page", { method: "POST", signal,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(withDesignerCatalogContext(input, scope)) });
}
async function fixture(run: (data: { scope: (binding: ActionProjectBinding) => NonNullable<DesignerCatalogScope>; path: (binding: ActionProjectBinding) => string; root: string }) => Promise<void>, fetcher: typeof fetch) {
  const parent = fileURLToPath(new URL("../../../../.tmp/designer-resource-pages/", import.meta.url));
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
  const spawn = mock.method(childProcess, "spawn", () => { throw new Error("Resource page fixture forbids CLI fallback"); }); syncBuiltinESMExports();
  try { await run({ scope, path, root }); }
  finally {
    globalThis.fetch = oldFetch; spawn.mock.restore(); syncBuiltinESMExports();
    for (const [key, value] of old) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    assert.ok(root.startsWith(join(parent, "fixture-"))); await rm(root, { recursive: true, force: true });
  }
}

test("resource paging has no legacy discovery for absent, loading, unbound, foreign or cancelled owners", async () => {
  let calls = 0;
  await fixture(async ({ scope, path }) => {
    await writeFile(path(a), JSON.stringify({ ...a, hostBinding: { ...a.hostBinding, future: { changed: true } } }));
    for (const [context, code] of [[undefined, "HOST_BINDING_REQUIRED"], [null, "PROJECT_IDENTITY_LOADING"],
      [{ ...scope(a), expectedProjectBinding: null }, "HOST_BINDING_REQUIRED"], [scope(a), "PROJECT_IDENTITY_CONFLICT"]] as const) {
      const response = await POST(request(context)); assert.equal(response.status, 409); assert.equal((await response.json()).code, code);
    }
    const invalid = await POST(request({} as NonNullable<DesignerCatalogScope>)); assert.equal(invalid.status, 400);
    const abort = new AbortController(); abort.abort(new Error("resource page already cancelled"));
    const stopped = await POST(request(scope(b), query(), abort.signal)); assert.equal(stopped.status, 499);
    assert.equal((await stopped.json()).error, "resource page already cancelled"); assert.equal(calls, 0);
  }, async () => { calls++; throw new Error("Unexpected transport"); });
});

test("missing and false capabilities deny each resource kind before host dispatch", async () => {
  let calls = 0;
  await fixture(async ({ scope, path }) => {
    for (const [kind, allowed] of [
      ["action", { "resource.action.page.read": false, "resource.globalSubprogram.page.read": true }],
      ["action", { "resource.globalSubprogram.page.read": true }],
      ["global_subprogram", { "resource.action.page.read": true, "resource.globalSubprogram.page.read": false }],
      ["global_subprogram", { "resource.action.page.read": true }],
    ] as const) {
      const record = binding("a", allowed); await writeFile(path(record), JSON.stringify(record));
      const response = await POST(request(scope(record), query(kind)));
      assert.equal(response.status, 409); assert.equal((await response.json()).code, "UNSUPPORTED_HOST");
    }
    assert.equal(calls, 0);
  }, async () => { calls++; throw new Error("Unsupported catalog must not call the host"); });
});

test("the actual resource route forwards both kinds and exact bindings, preserving Int64 versions", async () => {
  const calls: Invoke[] = [];
  await fixture(async ({ scope }) => {
    await Promise.all((["action", "global_subprogram"] as const).map(async (kind, index) => {
      const record = index === 0 ? a : b;
      const response = await POST(request(scope(record), { ...query(kind), query: " camera " }));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true, ...page(kind, record.hostBinding.hostInstanceId) });
    }));
    assert.equal(calls.length, 2);
  }, async (url, init) => {
    assert.equal(String(url), `${base}/v1/invoke`); const invoke: Invoke = JSON.parse(String(init?.body));
    assert.equal(invoke.op, "resource.catalog.page"); assert.deepEqual(invoke.args, query(invoke.args.kind));
    assert.deepEqual(invoke.hostBinding, invoke.args.kind === "action" ? a.hostBinding : b.hostBinding);
    calls.push(invoke); return Response.json({ ok: true, data: reply(invoke.args.kind, invoke.hostBinding.hostInstanceId) });
  });
});

test("invalid resource criteria make no host calls and inconsistent page facts cannot publish", async () => {
  let calls = 0, change: object = {};
  await fixture(async ({ scope }) => {
    for (const corrupt of [{ kind: "other" }, { scope: "all" }, { query: 7 }, { skip: 0.5 }, { take: 2147483648 }, { expectedSnapshotId: {} }]) {
      const response = await POST(request(scope(a), { ...query(), ...corrupt }));
      assert.equal(response.status, 400); assert.equal((await response.json()).code, "INVALID_RESOURCE_CATALOG_REQUEST");
    }
    assert.equal(calls, 0);
    for (const corrupt of [{ items: [] }, { kind: "global_subprogram" }, { scope: "all" }, { query: "other" }, { skip: 0 }, { take: 500 },
      { totalCount: 1 }, { hasMore: false }, { snapshotId: "snap-other" }]) {
      change = corrupt; const response = await POST(request(scope(a))); assert.equal(response.status, 503);
      assert.equal((await response.json()).code, "INVALID_RESOURCE_CATALOG_RESPONSE");
    }
    assert.equal(calls, 9);
  }, async () => { calls++; const data = reply("action", "fixture"); Object.assign(data.payload, change); return Response.json({ ok: true, data }); });
});

test("native catalog changes retain their original error and never switch to legacy search", async () => {
  let calls = 0;
  await fixture(async ({ scope }) => {
    const response = await POST(request(scope(a))); assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, code: "CATALOG_CHANGED", error: "Catalog owner changed; restart from the first page.", retryable: false });
    assert.equal(calls, 1);
  }, async () => { calls++; return Response.json({ ok: false, error: "CATALOG_CHANGED", message: "Catalog owner changed; restart from the first page." }); });
});

test("late binding mutation and cancellation cannot publish pages or alter document bytes", async () => {
  let mutate!: () => Promise<void>;
  await fixture(async ({ scope, path, root }) => {
    mutate = () => writeFile(path(a), JSON.stringify({ ...a, hostBinding: { ...a.hostBinding, quickerVersion: "changed" } }));
    const response = await POST(request(scope(a))); assert.equal(response.status, 409); assert.equal((await response.json()).code, "PROJECT_IDENTITY_CONFLICT");
    assert.equal(await readFile(join(root, scope(a).projectDirectory, "data.json"), "utf8"), '{"steps":[],"opaque":9223372036854775807}');
  }, async () => { await mutate(); return Response.json({ ok: true, data: reply("action", "late") }); });
  const abort = new AbortController(); let calls = 0;
  await fixture(async ({ scope }) => {
    const response = await POST(request(scope(a), query(), abort.signal)); assert.equal(response.status, 499);
    assert.equal((await response.json()).error, "cancel this resource page"); assert.equal(calls, 1);
    const survivor = await POST(request(scope(b), query("global_subprogram"))); assert.equal(survivor.status, 200);
  }, async (_url, init) => {
    calls++; const invoke: Invoke = JSON.parse(String(init?.body));
    if (invoke.hostBinding.hostInstanceId === "instance-a") abort.abort(new Error("cancel this resource page"));
    return Response.json({ ok: true, data: reply(invoke.args.kind, invoke.hostBinding.hostInstanceId) });
  });
});
