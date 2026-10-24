import assert from "node:assert/strict";
import { test } from "node:test";
import { createDesignerCatalogPort } from "../catalog/designerCatalogPort";
import type { DesignerCatalogContext } from "../catalog/designerCatalogContext";
import { fetchStepRunnerDetailItem } from "./designerHostGrpcApi";
import { fetchStepRunnersItems, hydrateMissingStepRunnerItems, hydrateMissingStepRunnerEntries } from "../steps/stepRunnerCatalog";
import { StepRunnerItem } from "../types/action_query";
import { collectStepRunnerSchemaRequestsFromSteps, stepRunnerSchemaCacheKey } from "../steps/stepParamVisibility";

const scope: DesignerCatalogContext = { cwd: "C:/fixture", projectDirectory: ".quicker/actions/a", expectedProjectBinding: {
  schemaVersion: 1, kind: "action", actionId: "11111111-1111-4111-8111-111111111111", hostBinding: {
    hostInstanceId: "same-instance", hostSessionId: "a".repeat(32), endpoint: `QuickerRpc_User_${"A".repeat(24)}_${"a".repeat(32)}`,
    protocolVersion: 1, schemaVersion: 1, hostKind: "v1", quickerVersion: "unchanged", capabilities: {},
  },
} };
const runner = (name: string) => StepRunnerItem.fromPartial({ key: "fixture:current", name, icon: "fixture-icon",
  inputParamDefs: [{ key: "text", name, varType: 0, defaultValue: name }], outputParamDefs: [] });
const response = (item: StepRunnerItem) => Response.json({ ok: true, item, items: [item], source: "live" });
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test("same-session native directory and detail reads do not reuse completed or primed results", async () => {
  let name = "first", calls = 0;
  const port = createDesignerCatalogPort(scope, async () => { calls++; return response(runner(name)); });
  port.set("list", [runner("stale")]); port.set("details", new Map([["fixture:current\0", runner("stale")]]));
  port.set("schemas", { "fixture:current": runner("stale") });
  assert.equal((await fetchStepRunnerDetailItem("fixture:current", undefined, undefined, port))?.name, "first");
  assert.equal((await fetchStepRunnersItems("", { catalogPort: port }))[0]?.name, "first");
  name = "changed without a new host or version";
  assert.equal((await fetchStepRunnerDetailItem("fixture:current", undefined, undefined, port))?.name, name);
  assert.equal((await fetchStepRunnersItems("", { catalogPort: port }))[0]?.name, name);
  assert.equal(calls, 4); port.dispose();
});

test("a failed fresh native read never returns its previous successful schema or directory", async () => {
  let fail = false;
  const port = createDesignerCatalogPort(scope, async () => fail
    ? new Response(JSON.stringify({ ok: false, code: "CATALOG_REQUEST_FAILED", error: "native unavailable" }), { status: 503 })
    : response(runner("previous success")));
  await fetchStepRunnerDetailItem("fixture:current", undefined, undefined, port);
  await fetchStepRunnersItems("", { catalogPort: port }); fail = true;
  await assert.rejects(fetchStepRunnerDetailItem("fixture:current", undefined, undefined, port), /native unavailable/);
  await assert.rejects(fetchStepRunnersItems("", { catalogPort: port }), /native unavailable/);
  port.dispose();
});

test("hydration reads again even with full previous definitions and observes same-size UI changes", async () => {
  let name = "new title and default", calls = 0;
  const port = createDesignerCatalogPort(scope, async () => { calls++; return response(runner(name)); });
  const steps = [{ stepId: "s", stepRunnerKey: "fixture:current", inputParams: { text: { value: "human draft" } } }];
  const first = await hydrateMissingStepRunnerItems(steps, [runner("old")], { "fixture:current": runner("old") }, undefined, { catalogPort: port });
  assert.equal(first.schemaByCacheKey["fixture:current"].inputParamDefs[0].defaultValue, name);
  assert.equal(first.schemaChanged, true); name = "another current title";
  const second = await hydrateMissingStepRunnerItems(steps, first.catalogItems, first.schemaByCacheKey, undefined, { catalogPort: port });
  assert.equal(second.schemaByCacheKey["fixture:current"].name, name);
  assert.equal(steps[0].inputParams.text.value, "human draft");
  assert.equal(calls, 2); port.dispose();
});

test("hydration failures with full prior definitions and labels remain failures", async () => {
  const port = createDesignerCatalogPort(scope, async () => { throw Error("fresh provider failed"); });
  const step = { stepId: "s", stepRunnerKey: "fixture:current", inputParams: {} };
  await assert.rejects(hydrateMissingStepRunnerItems([step], [runner("old")], { "fixture:current": runner("old") }, undefined, { catalogPort: port }), /fresh provider failed/);
  await assert.rejects(hydrateMissingStepRunnerEntries([step.stepRunnerKey], { "fixture:current": { key: step.stepRunnerKey, name: "old", icon: "old", description: "old" } }, undefined, { catalogPort: port }), /fresh provider failed/);
  port.dispose();
});

test("cancelled earlier read cannot fill or replace the next same-query read", async () => {
  let release!: (r: Response) => void, calls = 0;
  const oldReply = new Promise<Response>(resolve => { release = resolve; });
  const port = createDesignerCatalogPort(scope, async () => ++calls === 1 ? oldReply : response(runner("new request")));
  const abort = new AbortController();
  const old = fetchStepRunnerDetailItem("fixture:current", undefined, abort.signal, port);
  await tick(); abort.abort(new Error("cancel old")); await assert.rejects(old, /cancel old/);
  assert.equal((await fetchStepRunnerDetailItem("fixture:current", undefined, undefined, port))?.name, "new request");
  release(response(runner("late old"))); await tick();
  assert.equal((await fetchStepRunnerDetailItem("fixture:current", undefined, undefined, port))?.name, "new request");
  assert.equal(calls, 3); assert.equal(port.get("details"), undefined); port.dispose();
});

test("legacy UI reads also stay fresh and preserve failure without a global result cache", async () => {
  const original = globalThis.fetch; let name = "old", fail = false, calls = 0;
  globalThis.fetch = async () => { calls++; if (fail) throw Error("offline now"); return response(runner(name)); };
  try {
    assert.equal((await fetchStepRunnerDetailItem("fixture:current"))?.name, "old");
    await fetchStepRunnersItems(""); name = "new";
    assert.equal((await fetchStepRunnerDetailItem("fixture:current"))?.name, "new");
    assert.equal((await fetchStepRunnersItems(""))[0]?.name, "new"); fail = true;
    await assert.rejects(fetchStepRunnerDetailItem("fixture:current"), /offline now/);
    await assert.rejects(fetchStepRunnersItems(""), /offline now/); assert.equal(calls, 6);
  } finally { globalThis.fetch = original; }
});

test("bound requests and legacy UI URLs preserve absent, empty, whitespace and case control literals", async () => {
  const values = [undefined, "", " Mode ", "Mode", "mode", "--json"];
  const seen: Array<{ present: boolean; value: unknown }> = [];
  const port = createDesignerCatalogPort(scope, async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    seen.push({ present: Object.hasOwn(body, "controlField"), value: body.controlField });
    return response(runner("native"));
  });
  for (const control of values) await fetchStepRunnerDetailItem("fixture:current", control, undefined, port);
  assert.deepEqual(seen, values.map(value => ({ present: value !== undefined, value })));
  port.dispose();
  const original = globalThis.fetch; seen.length = 0;
  globalThis.fetch = async input => {
    const query = new URL(String(input), "https://fixture.invalid").searchParams;
    seen.push({ present: query.has("controlField"), value: query.get("controlField") ?? undefined });
    return response(runner("native"));
  };
  try {
    for (const control of values) await fetchStepRunnerDetailItem("fixture:current", control);
    assert.deepEqual(seen, values.map(value => ({ present: value !== undefined, value })));
  } finally { globalThis.fetch = original; }
});

test("concurrent differing control literals stay independent and a late rejection cannot mask another result", async () => {
  const values = [undefined, "", " Mode ", "Mode", "mode"];
  const gates = new Map<string, (reply: Response) => void>(); let calls = 0;
  const identity = (control: string | undefined) => JSON.stringify(control ?? null);
  const port = createDesignerCatalogPort(scope, async (_url, init) => {
    calls++; const body = JSON.parse(String(init?.body));
    return new Promise<Response>(resolve => { gates.set(identity(body.controlField), resolve); });
  });
  const pending = values.map(control => fetchStepRunnerDetailItem("fixture:current", control, undefined, port));
  const duplicate = fetchStepRunnerDetailItem("fixture:current", "Mode", undefined, port);
  const observed = Promise.allSettled(pending);
  await tick(); assert.equal(calls, 5); assert.equal(gates.size, 5);
  for (const control of values.slice(1)) gates.get(identity(control))!(response(runner(JSON.stringify(control))));
  assert.equal((await duplicate)?.name, '"Mode"');
  gates.get(identity(undefined))!(new Response(JSON.stringify({ok:false,code:"INVALID_CONTROL",error:"native rejects missing control"}),{status:503}));
  const results = await observed;
  assert.equal(results[0].status, "rejected");
  assert.deepEqual(results.slice(1).map(result => result.status === "fulfilled" ? result.value?.name : "rejected"), values.slice(1).map(value => JSON.stringify(value)));
  const fresh = fetchStepRunnerDetailItem("fixture:current", "", undefined, port);
  await tick(); gates.get(identity(""))!(response(runner("fresh empty")));
  assert.equal((await fresh)?.name, "fresh empty"); assert.equal(calls, 6); port.dispose();
});

test("schema collection, identities and hydration do not merge empty or normalized control variants", async () => {
  const values = [undefined, "", " Mode ", "Mode", "mode"];
  const steps = values.map((value,index) => ({stepId:String(index),stepRunnerKey:"fixture:current",inputParams:value===undefined?{}:{type:{value}}}));
  assert.deepEqual(collectStepRunnerSchemaRequestsFromSteps(steps).map(request => request.controlLiteral), values);
  assert.equal(new Set(steps.map(stepRunnerSchemaCacheKey)).size, values.length);
  const seen: unknown[] = [];
  const port = createDesignerCatalogPort(scope, async (_url,init) => {
    const control = JSON.parse(String(init?.body)).controlField; seen.push(control);
    return response(runner(JSON.stringify(control ?? null)));
  });
  const result = await hydrateMissingStepRunnerItems(steps,[runner("base")],{},undefined,{catalogPort:port});
  assert.deepEqual(seen,values);
  for (const value of values) assert.equal(result.schemaByCacheKey[value===undefined?"fixture:current":`fixture:current\0${value}`].name,JSON.stringify(value??null));
  port.dispose();
});
