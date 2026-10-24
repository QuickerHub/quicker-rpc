import assert from "node:assert/strict";
import { test } from "node:test";
import { createDesignerCatalogPort } from "./designerCatalogPort";
import type { DesignerCatalogContext, DesignerCatalogScope } from "./designerCatalogContext";
import { parseActionProjectBinding } from "../../action-project-binding";
import { STEP_RUNNER_INPUT_CONTRACT_CAPABILITY } from "../../step-runner-input-contract";

const actionId = "11111111-1111-4111-8111-111111111111";
function context(letter = "a", hostKind: "v1" | "v2" = "v1"): DesignerCatalogContext {
  return { cwd: "C:/fixture/workspace", projectDirectory: `.quicker/actions/${letter}`,
    expectedProjectBinding: parseActionProjectBinding({ schemaVersion: 1, kind: "action", actionId, hostBinding: {
      hostInstanceId: `instance-${letter}`, hostSessionId: letter.repeat(32), endpoint: `QuickerRpc_User_${"C".repeat(24)}_${letter.repeat(32)}`,
      protocolVersion: 1, schemaVersion: 1, hostKind, quickerVersion: "fixture",
      capabilities: { [STEP_RUNNER_INPUT_CONTRACT_CAPABILITY]: true, unrelated: false },
    } }, actionId) };
}
function changedBinding(patch: object): DesignerCatalogContext {
  const scope = context();
  return { ...scope, expectedProjectBinding: { ...scope.expectedProjectBinding!, hostBinding: { ...scope.expectedProjectBinding!.hostBinding, ...patch } } };
}
function contract(patch: Record<string, unknown> = {}) {
  return { version: 1, source: "runtime-definition", hostKind: "v1", stepRunnerKey: "sys:fixture",
    controlFieldKey: null, appliedControlFieldValue: null, visibilityResolved: true,
    reservedBindings: ["file", "varKey", ".file", ".var"], inputs: [
      { key: "text", policyKnown: true, varType: 0, variableMode: 0, allowInput: false, isControlField: false,
        visibilityResolved: true, visible: true, literalPolicy: "allowed", literalValueRestriction: "none", blockedReason: null, options: [] },
      { key: "unknown", policyKnown: false, varType: null, variableMode: null, allowInput: null, isControlField: null,
        visibilityResolved: false, visible: false, literalPolicy: "unknown", literalValueRestriction: "unknown", blockedReason: "native facts unavailable", options: [] },
    ], ...patch };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const live = (patch: Record<string, unknown> = {}) => json({ ok: true, source: "live", contract: contract(patch) });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
const tick = () => new Promise<void>((done) => setImmediate(done));

test("bound input contract reads send the complete frozen target and decode explicit zero false and null", async () => {
  const original = context();
  const expected = structuredClone(original);
  let calls = 0;
  const port = createDesignerCatalogPort(original, async (path, init) => {
    calls++;
    assert.equal(path, "/api/step-runner/input-contract"); assert.equal(init?.method, "POST"); assert.equal(init?.cache, "no-store");
    assert.deepEqual(JSON.parse(String(init?.body)), { key: "sys:fixture", catalogContext: expected });
    return live();
  });
  original.cwd = "C:/different";
  original.expectedProjectBinding = { ...original.expectedProjectBinding!, hostBinding: { ...original.expectedProjectBinding!.hostBinding, quickerVersion: "changed" } };
  const result = await port.readInputContract({ stepRunnerKey: "sys:fixture" });
  assert.equal(calls, 1); assert.equal(result.source, "runtime-definition");
  assert.equal(result.inputs[0].varType, 0); assert.equal(result.inputs[0].variableMode, 0);
  assert.equal(result.inputs[0].allowInput, false); assert.equal(result.inputs[0].isControlField, false);
  assert.equal(result.inputs[0].blockedReason, null); assert.equal(result.inputs[1].varType, null);
  assert.equal(result.inputs[1].literalPolicy, "unknown"); assert.equal(result.controlFieldKey, null);
  assert.equal(result.appliedControlFieldValue, null);
  assert.equal(Object.isFrozen(result), true); assert.equal(Object.isFrozen(result.inputs[0]), true);
  port.dispose();
});

test("input contract reads require a live full binding supported kind and explicit capability before fetch", async () => {
  let calls = 0;
  const noFetch: typeof fetch = async () => { calls++; throw Error("No unbound or unsupported fetch"); };
  const missing = changedBinding({ capabilities: {} });
  const disabled = changedBinding({ capabilities: { [STEP_RUNNER_INPUT_CONTRACT_CAPABILITY]: false } });
  const truthy = changedBinding({ capabilities: { [STEP_RUNNER_INPUT_CONTRACT_CAPABILITY]: "true" } });
  const unknown = changedBinding({ hostKind: "unknown" });
  const malformed = changedBinding({ endpoint: undefined });
  const scopes: DesignerCatalogScope[] = [undefined, null, { ...context(), expectedProjectBinding: null }, missing, disabled, truthy, unknown, malformed];
  for (const scope of scopes) {
    const port = createDesignerCatalogPort(scope, noFetch);
    await assert.rejects(port.readInputContract({ stepRunnerKey: "sys:fixture" }));
    port.dispose();
  }
  const closed = createDesignerCatalogPort(context(), noFetch); closed.dispose();
  await assert.rejects(closed.readInputContract({ stepRunnerKey: "sys:fixture" }), { code: "STALE_CATALOG_OWNER" });
  const stopped = new AbortController(), reason = Error("already stopped"); stopped.abort(reason);
  const port = createDesignerCatalogPort(context(), noFetch);
  await assert.rejects(port.readInputContract({ stepRunnerKey: "sys:fixture" }, stopped.signal), (error) => error === reason);
  assert.equal(calls, 0); port.dispose();
});

test("malformed input values never dispatch an input contract request", async () => {
  let calls = 0;
  const port = createDesignerCatalogPort(context(), async () => { calls++; return live(); });
  for (const input of [null, {}, { stepRunnerKey: "" }, { stepRunnerKey: " sys:fixture" }, { stepRunnerKey: "sys:\0fixture" },
    { stepRunnerKey: "sys:fixture", controlFieldValue: null }, { stepRunnerKey: "sys:fixture", controlFieldValue: false }]) {
    await assert.rejects(port.readInputContract(input as Parameters<typeof port.readInputContract>[0]), { code: "INVALID_INPUT_CONTRACT_REQUEST" });
  }
  assert.equal(calls, 0); port.dispose();
});

test("omitted empty and switch-like control literals stay distinct without inferring a default", async () => {
  const seen: Record<string, unknown>[] = [];
  const port = createDesignerCatalogPort(context(), async (_path, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>; seen.push(body);
    return live({ controlFieldKey: "operation", appliedControlFieldValue: Object.hasOwn(body, "controlField") ? body.controlField : "native-default" });
  });
  const first = await port.readInputContract({ stepRunnerKey: "sys:fixture" });
  assert.equal(first.appliedControlFieldValue, "native-default");
  assert.equal(Object.hasOwn(seen[0], "controlField"), false);
  for (const value of ["", "--json", " A ", "--control-field=x"]) {
    const result = await port.readInputContract({ stepRunnerKey: "sys:fixture", controlFieldValue: value });
    assert.equal(result.appliedControlFieldValue, value); assert.equal(seen.at(-1)?.controlField, value);
  }
  port.dispose();
});

test("the same typed contract can be read for an explicitly supported V2 target without pretending absent capability exists", async () => {
  const scope = context("b", "v2");
  const port = createDesignerCatalogPort(scope, async (_path, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)).catalogContext, scope);
    return live({ hostKind: "v2" });
  });
  assert.equal((await port.readInputContract({ stepRunnerKey: "sys:fixture" })).hostKind, "v2");
  port.dispose();
});

test("malformed envelopes native facts host runner and explicit control replies are rejected without fallback", async () => {
  const incomplete = contract(); delete (incomplete.inputs[0] as Partial<typeof incomplete.inputs[0]>).allowInput;
  const replies = [
    { source: "live", contract: contract() }, { ok: "true", source: "live", contract: contract() },
    { ok: true, source: "static", contract: contract() }, { ok: true, source: "live" },
    { ok: true, source: "live", contract: incomplete },
    ...[{ version: 2 }, { source: "ui" }, { hostKind: "v2" }, { stepRunnerKey: "sys:other" }].map((patch) => ({ ok: true, source: "live", contract: contract(patch) })),
    { ok: true, source: "live", contract: contract({ controlFieldKey: "operation", appliedControlFieldValue: "other" }) },
  ];
  let calls = 0;
  const port = createDesignerCatalogPort(context(), async (path) => {
    assert.equal(path, "/api/step-runner/input-contract");
    return json(replies[calls++]);
  });
  for (const _reply of replies) await assert.rejects(
    port.readInputContract({ stepRunnerKey: "sys:fixture", controlFieldValue: "" }), { code: "INVALID_INPUT_CONTRACT_RESPONSE" });
  assert.equal(calls, replies.length); port.dispose();
});

test("completed and failed reads never use or populate persistent catalog caches", async () => {
  let calls = 0;
  const port = createDesignerCatalogPort(context(), async () => ++calls === 1
    ? json({ ok: false, code: "PROJECT_IDENTITY_CONFLICT", error: "Changed target" }, 409) : live());
  port.set("input-contract", contract({ source: "static" }));
  await assert.rejects(port.readInputContract({ stepRunnerKey: "sys:fixture" }), { code: "PROJECT_IDENTITY_CONFLICT" });
  await port.readInputContract({ stepRunnerKey: "sys:fixture" });
  await port.readInputContract({ stepRunnerKey: "sys:fixture" });
  assert.equal(calls, 3); port.dispose();
});

test("one canceled waiter never owns another input contract observer", async () => {
  const reply = deferred<Response>(); let calls = 0, signal: AbortSignal | null | undefined;
  const port = createDesignerCatalogPort(context(), async (_path, init) => { calls++; signal = init?.signal; return reply.promise; });
  const abort = new AbortController(), reason = Error("first observer only");
  const first = port.readInputContract({ stepRunnerKey: "sys:fixture" }, abort.signal);
  const second = port.readInputContract({ stepRunnerKey: "sys:fixture" });
  await tick(); abort.abort(reason);
  await assert.rejects(first, (error) => error === reason); assert.equal(signal?.aborted, false);
  reply.resolve(live()); assert.equal((await second).stepRunnerKey, "sys:fixture");
  assert.equal(calls, 1); port.dispose();
});

test("last waiter abort rejects promptly and an old reply cannot cancel or supply a newer read", async () => {
  const old = deferred<Response>(), next = deferred<Response>();
  const signals: (AbortSignal | null | undefined)[] = []; let calls = 0;
  const port = createDesignerCatalogPort(context(), async (_path, init) => { signals.push(init?.signal); return ++calls === 1 ? old.promise : next.promise; });
  const abort = new AbortController(), reason = Error("last observer stopped");
  const first = port.readInputContract({ stepRunnerKey: "sys:fixture" }, abort.signal);
  await tick(); abort.abort(reason);
  await assert.rejects(first, (error) => error === reason); assert.equal(signals[0]?.aborted, true);
  const current = port.readInputContract({ stepRunnerKey: "sys:fixture" });
  await tick(); old.resolve(live({ stepRunnerKey: "sys:old" })); await tick();
  assert.equal(signals[1]?.aborted, false);
  next.resolve(live()); assert.equal((await current).stepRunnerKey, "sys:fixture");
  assert.equal(calls, 2); port.dispose();
});

test("disposing an owner or canceling while JSON settles never publishes a late input contract", async () => {
  const reply = deferred<Response>(); let signal: AbortSignal | null | undefined;
  const port = createDesignerCatalogPort(context(), async (_path, init) => { signal = init?.signal; return reply.promise; });
  const first = port.readInputContract({ stepRunnerKey: "sys:fixture" });
  const second = port.readInputContract({ stepRunnerKey: "sys:fixture" });
  await tick(); port.dispose();
  await assert.rejects(first, { name: "AbortError" }); await assert.rejects(second, { name: "AbortError" });
  assert.equal(signal?.aborted, true); reply.resolve(live()); await tick();
  await assert.rejects(port.readInputContract({ stepRunnerKey: "sys:fixture" }), { code: "STALE_CATALOG_OWNER" });

  const body = deferred<unknown>(), entered = deferred<void>(), abort = new AbortController(), reason = Error("late body canceled");
  const livePort = createDesignerCatalogPort(context(), async () => ({ ok: true, status: 200, json() { entered.resolve(); return body.promise; } }) as Response);
  const pending = livePort.readInputContract({ stepRunnerKey: "sys:fixture" }, abort.signal);
  await entered.promise; abort.abort(reason); body.resolve({ ok: true, source: "live", contract: contract() });
  await assert.rejects(pending, (error) => error === reason); livePort.dispose();
});

test("a replacement document owner does not inherit a disposed owner's pending response", async () => {
  const oldReply = deferred<Response>(); let calls = 0;
  const old = createDesignerCatalogPort(context(), async () => { calls++; return oldReply.promise; });
  const replacement = createDesignerCatalogPort(context(), async () => { calls++; return live(); });
  const pending = old.readInputContract({ stepRunnerKey: "sys:fixture" });
  await tick(); old.dispose();
  await assert.rejects(pending, { name: "AbortError" });
  const current = await replacement.readInputContract({ stepRunnerKey: "sys:fixture" });
  oldReply.resolve(live({ stepRunnerKey: "sys:discarded" })); await tick();
  assert.equal(current.stepRunnerKey, "sys:fixture");
  assert.equal(calls, 2);
  assert.equal(replacement.supportsCapability(STEP_RUNNER_INPUT_CONTRACT_CAPABILITY), true);
  replacement.dispose();
});
