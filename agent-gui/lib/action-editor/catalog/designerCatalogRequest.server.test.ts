import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mock, test } from "node:test";
import { POST as list, GET as legacyList } from "../../../app/api/step-runner/list/route";
import { POST as get } from "../../../app/api/step-runner/get/route";
import { POST as summaries } from "../../../app/api/step-runner/summaries/route";
import { POST as toolbox } from "../../../app/api/step-runner/toolbox-search/route";
import { POST as quickInsert } from "../../../app/api/step-runner/quick-insert/route";
import { POST as io } from "../../../app/api/step-runner/subprogram-io/route";
import { POST as subprograms } from "../../../app/api/subprogram/list/route";
import { parseActionProjectBinding, type ActionProjectBinding } from "../../action-project-binding";
import { withDesignerCatalogContext, type DesignerCatalogScope } from "./designerCatalogContext";
import { createAgentApiRouter } from "../../agent-service/api-router";
import { agentApiRoutes } from "../../agent-service/api-routes.generated";

const actionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const base = "http://catalog-fixture.invalid:19477";
function binding(letter: "a" | "b"): ActionProjectBinding {
  return parseActionProjectBinding({ schemaVersion: 1, kind: "action", actionId, hostBinding: {
    hostInstanceId: `instance-${letter}`, hostSessionId: letter.repeat(32), endpoint: `QuickerRpc_User_${"C".repeat(24)}_${letter.repeat(32)}`,
    protocolVersion: 1, schemaVersion: 1, hostKind: letter === "a" ? "v1" : "v2", quickerVersion: "fixture", capabilities: { "stepRunner.catalog.read": true },
    future: { extension: letter },
  } }, actionId);
}
const a = binding("a"), b = binding("b");
const routes = [
  { name: "list", handler: list, body: { limit: 3 } },
  { name: "get", handler: get, body: { key: "sys:fixture", controlField: "mode" } },
  { name: "summaries", handler: summaries, body: { steps: [{ stepId: "s", stepRunnerKey: "sys:fixture", stepJson: "{}" }] } },
  { name: "toolbox", handler: toolbox, body: { keyword: "fixture" } },
  { name: "quick-insert", handler: quickInsert, body: { keyword: "fixture" } },
  { name: "io", handler: io, body: { kind: "global", id: "fixture" } },
  { name: "subprograms", handler: subprograms, body: { limit: 3 } },
];
type Invoke = { op: string; args: Record<string, unknown>; hostBinding?: ActionProjectBinding["hostBinding"] };
function request(route: (typeof routes)[number], scope: DesignerCatalogScope, signal?: AbortSignal) {
  return new Request(`http://fixture.invalid/api/catalog/${route.name}`, { method: "POST", signal,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(withDesignerCatalogContext(route.body, scope)) });
}

async function fixture(run: (data: { root: string; scope: (record: ActionProjectBinding) => NonNullable<DesignerCatalogScope>; path: (record: ActionProjectBinding) => string }) => Promise<void>, fetch?: typeof globalThis.fetch) {
  const parent = fileURLToPath(new URL("../../../../.tmp/designer-bound-catalog/", import.meta.url));
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "fixture-"));
  const scope = (record: ActionProjectBinding) => ({ cwd: root, projectDirectory: `.quicker/actions/${record.hostBinding.hostInstanceId}`, expectedProjectBinding: record });
  const path = (record: ActionProjectBinding) => join(root, scope(record).projectDirectory, ".qkrpc/project-binding.json");
  for (const record of [a, b]) {
    await mkdir(join(root, scope(record).projectDirectory, ".qkrpc"), { recursive: true });
    await writeFile(path(record), JSON.stringify(record));
    await writeFile(join(root, scope(record).projectDirectory, "info.json"), JSON.stringify({ id: actionId, title: "fixture" }));
    await writeFile(join(root, scope(record).projectDirectory, "data.json"), '{"steps":[],"opaque":9223372036854775807}');
  }
  const oldFetch = globalThis.fetch;
  const overrides: Record<string, string | undefined> = { QKRPC_HTTP_URL: base, QKRPC_TRANSPORT: "http", QKRPC_HOST_BINDING: undefined,
    QKRPC_HOST_SESSION: undefined, STEP_RUNNER_CATALOG_STATIC: undefined };
  const old = new Map(Object.keys(overrides).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(overrides)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  globalThis.fetch = fetch ?? (async () => { throw new Error("Catalog fixture forbids network"); });
  const spawn = mock.method(childProcess, "spawn", () => { throw new Error("Catalog fixture forbids CLI fallback"); });
  syncBuiltinESMExports();
  try { await run({ root, scope, path }); }
  finally {
    globalThis.fetch = oldFetch;
    spawn.mock.restore(); syncBuiltinESMExports();
    for (const [key, value] of old) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    assert.ok(root.startsWith(join(parent, "fixture-"))); await rm(root, { recursive: true, force: true });
  }
}

function catalogReply(invoke: Invoke) {
  assert.notEqual(invoke.op, "host.list", "A document catalog must never discover another host");
  const name = invoke.hostBinding!.hostInstanceId;
  if (invoke.op === "step-runner.getUi") return { schema: { key: "sys:fixture", name, inputs: [{ key: "value", name, valueType: "Text" }] } };
  if (invoke.op === "step-runner.toolboxsearch" || invoke.op === "step-runner.quickinsertsearch") return { json: JSON.stringify({ items: [{ name }], totalCount: 1 }) };
  if (invoke.op === "step-runner.summaries") return { items: [{ stepId: "s", summary: name }] };
  if (invoke.op === "subprogram.get") return { name, variables: [] };
  return { items: [{ key: "sys:fixture", id: "fixture", name, icon: "fixture-icon" }] };
}

test("all seven production catalog routes reject loading, unbound, mismatch and pre-abort without discovery or RPC", async () => {
  let calls = 0;
  await fixture(async ({ scope, path }) => {
    await writeFile(path(a), JSON.stringify({ ...a, hostBinding: { ...a.hostBinding, future: { changed: true } } }));
    for (const route of routes) {
      for (const [context, code] of [[null, "PROJECT_IDENTITY_LOADING"], [{ ...scope(a), expectedProjectBinding: null }, "HOST_BINDING_REQUIRED"], [scope(a), "PROJECT_IDENTITY_CONFLICT"]] as const) {
        const response = await route.handler(request(route, context));
        const body = await response.json();
        assert.equal(response.status, 409, route.name);
        assert.equal(body.code, code, route.name);
        assert.equal(body.retryable, false);
      }
      const controller = new AbortController(); controller.abort(new Error("fixture abort"));
      const response = await route.handler(request(route, scope(a), controller.signal));
      assert.equal(response.status, 499, route.name);
      assert.equal((await response.json()).error, "fixture abort");
    }
    assert.equal(calls, 0);
  }, async () => { calls++; throw new Error("Must not contact any host"); });
});

test("two concurrent documents request the same runner from their exact hosts across all seven routes", async () => {
  const calls: Invoke[] = [];
  await fixture(async ({ scope }) => {
    const responses = await Promise.allSettled(routes.flatMap((route) => [a, b].map(async (record) => {
      const response = await route.handler(request(route, scope(record)));
      assert.equal(response.status, 200, `${route.name}: ${JSON.stringify(await response.clone().json())}`);
      const text = JSON.stringify(await response.json());
      assert.ok(text.includes(record.hostBinding.hostInstanceId), `${route.name}: ${text}`);
      assert.ok(!text.includes(record === a ? "instance-b" : "instance-a"));
    })));
    assert.equal(responses.length, 14);
    for (const response of responses) if (response.status === "rejected") throw response.reason;
    assert.equal(calls.length, 14);
    assert.deepEqual(new Set(calls.map((call) => call.hostBinding!.hostSessionId)), new Set([a.hostBinding.hostSessionId, b.hostBinding.hostSessionId]));
  }, async (url, init) => {
    assert.equal(String(url), `${base}/v1/invoke`, "No health probing or replacement gateway scan");
    const invoke: Invoke = JSON.parse(String(init?.body)); calls.push(invoke);
    await Promise.resolve();
    return Response.json({ ok: true, data: catalogReply(invoke) });
  });
});

test("bound global IO reads stay raw and reject missing variable facts without creating a local subprogram project", async () => {
  let malformed = false, calls = 0;
  await fixture(async ({ root, scope }) => {
    const before = await readdir(join(root, ".quicker"));
    const route = routes.find((entry) => entry.name === "io")!;
    const response = await io(request(route, scope(a))); assert.equal(response.status, 200);
    const value = await response.json(); assert.equal(value.found, true); assert.deepEqual(value.inputs, []); assert.deepEqual(value.outputs, []);
    malformed = true;
    const failed = await io(request(route, scope(a))); assert.equal(failed.status, 503); assert.equal((await failed.json()).code, "INVALID_SUBPROGRAM_IO");
    assert.deepEqual(await readdir(join(root, ".quicker")), before); assert.equal(calls, 2);
    assert.equal(await readFile(join(scope(a).cwd!, scope(a).projectDirectory, "data.json"), "utf8"), '{"steps":[],"opaque":9223372036854775807}');
  }, async (_url, init) => {
    calls++; const invoke: Invoke = JSON.parse(String(init?.body));
    assert.equal(invoke.op, "subprogram.get"); assert.deepEqual(invoke.args, { id: "fixture", returnMode: "full" });
    assert.deepEqual(invoke.hostBinding, a.hostBinding);
    return Response.json({ ok: true, data: { name: "fixture", ...(malformed ? {} : { variables: [] }) } });
  });
});

test("bound host loss never falls back to the bundled static list or schema, even in static development mode", async () => {
  let calls = 0;
  await fixture(async ({ scope }) => {
    process.env.STEP_RUNNER_CATALOG_STATIC = "1";
    for (const route of routes) {
      const response = await route.handler(request(route, scope(a)));
      assert.equal(response.status, 503, route.name);
      const result = await response.json();
      assert.equal(result.code, "HOST_UNAVAILABLE");
      assert.equal(result.source, undefined);
    }
    assert.equal(calls, 7);
  }, async () => { calls++; throw new Error("fetch failed"); });
});

test("native catalog failures inside successful serve envelopes remain failures without static fallback", async () => {
  await fixture(async ({ scope }) => {
    for (const route of routes) {
      const response = await route.handler(request(route, scope(a)));
      assert.equal(response.status, 503, route.name);
      const result = await response.json();
      assert.equal(result.code, "CATALOG_REQUEST_FAILED");
      assert.equal(result.source, undefined);
    }
  }, async () => Response.json({ ok: true, data: { ok: false, payload: { success: false, errorMessage: "fixture native catalog unavailable" } } }));
});

test("the independent Node API manifest dispatches the new bound POST catalog handler", async () => {
  await fixture(async ({ scope }) => {
    const route = createAgentApiRouter(agentApiRoutes);
    const response = await route(new Request("http://fixture.invalid/api/step-runner/list", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(withDesignerCatalogContext({ limit: 3 }, scope(a))) }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).items[0].name, "instance-a");
  }, async (_url, init) => Response.json({ ok: true, data: catalogReply(JSON.parse(String(init?.body))) }));
});

test("sidecar changes during a catalog read reject late success instead of certifying another document target", async () => {
  let mutate!: () => Promise<void>;
  await fixture(async ({ scope, path }) => {
    mutate = () => writeFile(path(a), JSON.stringify({ ...a, hostBinding: { ...a.hostBinding, quickerVersion: "changed" } }));
    const response = await get(request(routes[1], scope(a)));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "PROJECT_IDENTITY_CONFLICT");
    assert.equal(await readFile(join(scope(a).cwd!, scope(a).projectDirectory, "data.json"), "utf8"), '{"steps":[],"opaque":9223372036854775807}');
  }, async (_url, init) => { const invoke: Invoke = JSON.parse(String(init?.body)); await mutate(); return Response.json({ ok: true, data: catalogReply(invoke) }); });
});

test("request abort during a late response remains HTTP499 and does not retry aliases or another host", async () => {
  const controller = new AbortController(); const reason = new Error("fixture stopped catalog");
  let calls = 0;
  await fixture(async ({ scope }) => {
    const response = await get(request(routes[1], scope(a), controller.signal));
    assert.equal(response.status, 499);
    assert.equal((await response.json()).error, reason.message);
    assert.equal(calls, 1);
  }, async (_url, init) => { calls++; assert.equal(init?.signal?.aborted, false); controller.abort(reason);
    return Response.json({ ok: true, data: catalogReply(JSON.parse(String(init?.body))) }); });
});

test("a fresh explicit conflicting host selection fails before a catalog call; legacy independent static GET still works", async () => {
  let calls = 0;
  await fixture(async ({ scope }) => {
    process.env.QKRPC_HOST_BINDING = JSON.stringify(b.hostBinding);
    const denied = await list(request(routes[0], scope(a)));
    assert.equal(denied.status, 409);
    assert.equal((await denied.json()).code, "HOST_BINDING_MISMATCH");
    process.env.STEP_RUNNER_CATALOG_STATIC = "1";
    const legacy = await legacyList(new Request("http://fixture.invalid/api/step-runner/list"));
    assert.equal(legacy.status, 200);
    assert.equal((await legacy.json()).source, "static");
    assert.equal(calls, 0);
  }, async () => { calls++; throw new Error("Must not discover"); });
});

test("bound missing catalog payloads and invalid inputs retain structured failure codes", async () => {
  await fixture(async ({ scope }) => {
    const malformed = await toolbox(request(routes[3], scope(a)));
    assert.equal(malformed.status, 503);
    assert.equal((await malformed.json()).code, "CATALOG_REQUEST_FAILED");
    const invalid = await get(new Request("http://fixture.invalid/api/step-runner/get", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(withDesignerCatalogContext({}, scope(a))) }));
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).code, "INVALID_CATALOG_REQUEST");
  }, async () => Response.json({ ok: true, data: {} }));
});

test("bound UI requests reach native invoke with exact control literals through the production API and argv adapter", async () => {
  const values = [undefined,""," Mode ","Mode","mode","--json"];
  const seen: unknown[] = [];
  await fixture(async ({scope}) => {
    for (const controlField of values) {
      const response = await get(new Request("http://fixture.invalid/api/step-runner/get",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(withDesignerCatalogContext({key:"sys:fixture",...(controlField===undefined?{}:{controlField})},scope(a)))}));
      assert.equal(response.status,200);
    }
    assert.deepEqual(seen,values);
  },async (_url,init) => {
    const invoke: Invoke = JSON.parse(String(init?.body));
    assert.equal(invoke.op,"step-runner.getUi"); seen.push(invoke.args.controlField);
    return Response.json({ok:true,data:catalogReply(invoke)});
  });
});
