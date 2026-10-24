import assert from "node:assert/strict";
import { test } from "node:test";
import { createDesignerCatalogPort } from "../catalog/designerCatalogPort";
import type { DesignerCatalogContext } from "../catalog/designerCatalogContext";
import { fetchStepRunnerDetailItem } from "./designerHostGrpcApi";
import { fetchStepRunnersItems, hydrateMissingStepRunnerItems, hydrateMissingStepRunnerEntries } from "../steps/stepRunnerCatalog";
import { StepRunnerItem } from "../types/action_query";

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
