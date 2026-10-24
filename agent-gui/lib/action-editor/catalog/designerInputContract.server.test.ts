import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mock, test } from "node:test";
import { POST } from "../../../app/api/step-runner/input-contract/route";
import { parseActionProjectBinding, type ActionProjectBinding } from "../../action-project-binding";
import { STEP_RUNNER_INPUT_CONTRACT_CAPABILITY } from "../../step-runner-input-contract";
import { withDesignerCatalogContext, type DesignerCatalogScope } from "./designerCatalogContext";

const actionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", base = "http://input-contract-fixture.invalid:19477";
const binding = (letter: string, supported = true): ActionProjectBinding => parseActionProjectBinding({ schemaVersion: 1, kind: "action", actionId,
  hostBinding: { hostInstanceId: `instance-${letter}`, hostSessionId: letter.repeat(32), endpoint: `QuickerRpc_User_${"C".repeat(24)}_${letter.repeat(32)}`,
    protocolVersion: 1, schemaVersion: 1, hostKind: "v1", quickerVersion: "fixture", capabilities: { [STEP_RUNNER_INPUT_CONTRACT_CAPABILITY]: supported } } }, actionId);
const a = binding("a"), b = binding("b", false);
const contract = (patch: object = {}) => ({ version: 1, source: "runtime-definition", hostKind: "v1", stepRunnerKey: "sys:fixture",
  controlFieldKey: null, appliedControlFieldValue: null, visibilityResolved: true,
  reservedBindings: ["file", "varKey", ".file", ".var"], inputs: [{ key: "text", policyKnown: true, varType: 0, variableMode: 0,
    allowInput: false, isControlField: false, visibilityResolved: true, visible: true, literalPolicy: "allowed",
    literalValueRestriction: "none", blockedReason: null, options: [] }], ...patch });
const reply = (value = contract()) => Response.json({ ok: true, data: { ok: true, action: "step-runner-input-contract", payload: { success: true, contract: value } } });
function request(scope: DesignerCatalogScope, input: object = { key: "sys:fixture" }, signal?: AbortSignal) {
  return new Request("http://fixture.invalid/api/step-runner/input-contract", { method: "POST", signal,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(withDesignerCatalogContext(input, scope)) });
}
async function fixture(run: (data: {
  scope(record: ActionProjectBinding): NonNullable<DesignerCatalogScope>; path(record: ActionProjectBinding): string; root: string;
}) => Promise<void>, fetcher: typeof fetch) {
  const parent = fileURLToPath(new URL("../../../../.tmp/designer-input-contract/", import.meta.url));
  await mkdir(parent, { recursive: true }); const root = await mkdtemp(join(parent, "fixture-"));
  const scope = (record: ActionProjectBinding) => ({ cwd: root, projectDirectory: `.quicker/actions/${record.hostBinding.hostInstanceId}`, expectedProjectBinding: record });
  const path = (record: ActionProjectBinding) => join(root, scope(record).projectDirectory, ".qkrpc/project-binding.json");
  for (const record of [a, b]) {
    await mkdir(join(root, scope(record).projectDirectory, ".qkrpc"), { recursive: true });
    await writeFile(path(record), JSON.stringify(record));
    await writeFile(join(root, scope(record).projectDirectory, "info.json"), JSON.stringify({ id: actionId }));
    await writeFile(join(root, scope(record).projectDirectory, "data.json"), '{"steps":[],"opaque":9223372036854775807}');
  }
  const overrides: Record<string, string | undefined> = { QKRPC_HTTP_URL: base, QKRPC_TRANSPORT: "http", QKRPC_HOST_BINDING: undefined, QKRPC_HOST_SESSION: undefined };
  const old = new Map(Object.keys(overrides).map((key) => [key, process.env[key]])), oldFetch = globalThis.fetch;
  for (const [key, value] of Object.entries(overrides)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  globalThis.fetch = fetcher;
  const spawn = mock.method(childProcess, "spawn", () => { throw new Error("Input contracts never fall back to a CLI or another host"); }); syncBuiltinESMExports();
  try { await run({ scope, path, root }); }
  finally {
    globalThis.fetch = oldFetch; spawn.mock.restore(); syncBuiltinESMExports();
    for (const [key, value] of old) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    assert.ok(root.startsWith(join(parent, "fixture-"))); await rm(root, { recursive: true, force: true });
  }
}

test("input contract reads require the same document binding and declared capability before any host call", async () => {
  let calls = 0;
  await fixture(async ({ scope }) => {
    for (const [context, status, code] of [[undefined, 409, "HOST_BINDING_REQUIRED"], [null, 409, "PROJECT_IDENTITY_LOADING"],
      [{ ...scope(a), expectedProjectBinding: null }, 409, "HOST_BINDING_REQUIRED"], [scope(b), 503, "INPUT_CONTRACT_UNSUPPORTED"]] as const) {
      const response = await POST(request(context)); assert.equal(response.status, status); assert.equal((await response.json()).code, code);
    }
    const abort = new AbortController(); abort.abort(new Error("already stopped"));
    assert.equal((await POST(request(scope(a), undefined, abort.signal))).status, 499);
    assert.equal(calls, 0);
  }, async () => { calls++; throw new Error("Unexpected transport"); });
});

test("the bound contract route uses its own native read and preserves false, zero and an empty control value", async () => {
  let calls = 0;
  await fixture(async ({ scope }) => {
    const result = await POST(request(scope(a), { key: "sys:fixture", controlField: "" }));
    assert.equal(result.status, 200); const body = await result.json();
    assert.equal(body.source, "live"); assert.equal(body.contract.inputs[0].variableMode, 0);
    assert.equal(body.contract.inputs[0].allowInput, false); assert.equal(body.contract.appliedControlFieldValue, ""); assert.equal(calls, 1);
  }, async (url, init) => {
    assert.equal(String(url), `${base}/v1/invoke`);
    const invoke = JSON.parse(String(init?.body)); assert.equal(invoke.op, "step-runner.input-contract");
    assert.deepEqual(invoke.args, { key: "sys:fixture", controlField: "" }); assert.deepEqual(invoke.hostBinding, a.hostBinding);
    calls++; return reply(contract({ controlFieldKey: "operation", appliedControlFieldValue: "" }));
  });
});

test("malformed requests never dispatch and malformed or wrong-target native contracts have no UI/static fallback", async () => {
  let calls = 0, change: object = {};
  await fixture(async ({ scope }) => {
    for (const input of [{ key: 4 }, { key: "" }, { key: "sys:fixture", controlField: null }]) {
      assert.equal((await POST(request(scope(a), input))).status, 400);
    }
    assert.equal(calls, 0);
    for (const patch of [{ hostKind: "v2" }, { stepRunnerKey: "sys:other" }, { source: "static" }, { inputs: [{ key: "text" }] }]) {
      change = patch; const response = await POST(request(scope(a)));
      assert.equal(response.status, 503); assert.equal((await response.json()).code, "INVALID_INPUT_CONTRACT_RESPONSE");
    }
    change = { controlFieldKey: "operation", appliedControlFieldValue: "other" };
    assert.equal((await POST(request(scope(a), { key: "sys:fixture", controlField: "Start" }))).status, 503);
    assert.equal(calls, 5);
  }, async () => { calls++; return reply(contract(change)); });
});

test("native control literals resembling CLI switches survive the real bound route", async () => {
  let calls = 0;
  await fixture(async ({ scope }) => {
    for (const value of ["--json", "--native-option", "--control-field=x", " A "]) {
      const response = await POST(request(scope(a), { key: "sys:fixture", controlField: value }));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).contract.appliedControlFieldValue, value);
    }
    assert.equal(calls, 4);
  }, async (_url, init) => {
    const invoke = JSON.parse(String(init?.body)); assert.equal(invoke.op, "step-runner.input-contract");
    calls++; return reply(contract({ controlFieldKey: "operation", appliedControlFieldValue: invoke.args.controlField }));
  });
});

test("late binding changes and cancellation cannot publish metadata or alter action files", async () => {
  let mutate!: () => Promise<void>;
  await fixture(async ({ scope, path, root }) => {
    mutate = () => writeFile(path(a), JSON.stringify({ ...a, hostBinding: { ...a.hostBinding, quickerVersion: "changed" } }));
    const response = await POST(request(scope(a))); assert.equal(response.status, 409); assert.equal((await response.json()).code, "PROJECT_IDENTITY_CONFLICT");
    assert.equal(await readFile(join(root, scope(a).projectDirectory, "data.json"), "utf8"), '{"steps":[],"opaque":9223372036854775807}');
  }, async () => { await mutate(); return reply(); });
  const abort = new AbortController();
  await fixture(async ({ scope }) => {
    const response = await POST(request(scope(a), undefined, abort.signal)); assert.equal(response.status, 499);
    assert.equal((await response.json()).error, "cancel input read");
  }, async () => { abort.abort(new Error("cancel input read")); return reply(); });
});
