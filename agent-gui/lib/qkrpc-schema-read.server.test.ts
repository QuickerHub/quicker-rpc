import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { test } from "node:test";
import { createQkrpcSchemaReadRunner } from "./qkrpc-schema-read.server";
import { bindQkrpcTarget, readHostBinding, type QkrpcHostBinding } from "./qkrpc-host-binding";
import { runWithAgentRequestContextAsync } from "./qkrpc-request-context";
import { createTurnExecutionState, disposeTurnExecutionState } from "./agent-harness/turn-execution-state";
import { markQkrpcConnectivityBlockedThisTurn } from "./qkrpc-connectivity-gate";
import type { QkrpcRunResult } from "./qkrpc-types";
import { STEP_RUNNER_SCHEMA_READ_FORMAT } from "./step-runner-schema-read";

const session = "a".repeat(32);
const binding = readHostBinding({ hostInstanceId: "schema-reader-owner", hostSessionId: session,
  endpoint: `QuickerRpc_User_${"A".repeat(24)}_${session}`, protocolVersion: 1, schemaVersion: 1,
  hostKind: "v1", quickerVersion: "fixture", capabilities: {} })!;
const args = ["step-runner", "get", "--key", "sys:fixture", "--control-field", " ",
  "--schema-read", JSON.stringify({ pointer: "", mode: "children", offset: 0 })];
const observation = `sha256:${"a".repeat(64)}`;
const page = { format: STEP_RUNNER_SCHEMA_READ_FORMAT, status: "available", observation,
  pointer: "", mode: "children", offset: 0, offsetUnit: "children", total: 0, nextOffset: null,
  selectedComplete: true, agentSchemaComplete: false, children: [],
  input: { key: "sys:fixture", controlField: " ", read: { pointer: "", mode: "children", offset: 0, expectedObservation: observation } },
};
const success: QkrpcRunResult = { ok: true, exitCode: 0, stdout: "", stderr: "", truncated: false,
  parsed: { action: "step-runner-get", payload: { success: true, schemaRead: {
    ...page,
  } } } };

function owned<T>(gateway: string, run: () => Promise<T>, state = createTurnExecutionState()) {
  return runWithAgentRequestContextAsync({ executionState: state }, async () => {
    bindQkrpcTarget({ gateway, binding });
    return run();
  });
}

test("a schema page cannot discover a host or choose a connection from its continuation", async () => {
  let calls = 0;
  const run = createQkrpcSchemaReadRunner({ http: async () => { calls++; return success; },
    cli: async () => { calls++; return success; }, binary: () => { calls++; return "unexpected"; } });
  const result = await runWithAgentRequestContextAsync({}, () => run(args));
  assert.equal((result.parsed as { error: string }).error, "HOST_BINDING_REQUIRED");
  assert.equal(calls, 0);
  for (const invalid of [["action", "delete", "--id", "fixture"], ["step-runner", "get", "--key", "sys:fixture"]]) {
    assert.equal((await owned("cli", () => run(invalid))).ok, false);
  }
  assert.equal(calls, 0);
});

test("a bound HTTP schema page stays on that gateway even with forced CLI configuration", async () => {
  const previous = process.env.QKRPC_TRANSPORT;
  process.env.QKRPC_TRANSPORT = "cli";
  let httpCalls = 0;
  let cliCalls = 0;
  try {
    const run = createQkrpcSchemaReadRunner({ http: async (invoke, options) => {
      httpCalls++;
      assert.equal(invoke.op, "step-runner.get");
      assert.equal(invoke.args.controlField, " ");
      assert.deepEqual(invoke.args.read, { pointer: "", mode: "children", offset: 0 });
      assert.equal(options?.gatewayBase, "http://127.0.0.1:1234");
      assert.deepEqual(options?.hostBinding, binding);
      return success;
    }, cli: async () => { cliCalls++; return success; }, binary: () => { cliCalls++; return "unexpected"; } });
    assert.equal(await owned("http://127.0.0.1:1234", () => run(args)), success);
    assert.equal(httpCalls, 1);
    assert.equal(cliCalls, 0);
  } finally {
    if (previous === undefined) delete process.env.QKRPC_TRANSPORT; else process.env.QKRPC_TRANSPORT = previous;
  }
});

test("CLI pages use an existing read-only binary and rebuild the no-bootstrap command", async () => {
  let calls = 0;
  const run = createQkrpcSchemaReadRunner({ binary: (options) => {
    assert.deepEqual(options, { readOnly: true }); return "fixture-existing-qkrpc.exe";
  }, http: async () => { assert.fail("no HTTP fallback"); }, cli: async (actual, options) => {
    calls++;
    assert.deepEqual(actual, [...args.slice(0, 4), "--schema-read", args.at(-1)!, "--control-field-json", JSON.stringify(" "), "--no-bootstrap"]);
    assert.equal(options?.binaryPath, resolve("fixture-existing-qkrpc.exe"));
    assert.equal(options?.json, true);
    assert.deepEqual(options?.hostBinding, binding);
    return success;
  } });
  assert.equal(await owned("cli", () => run([...args, "--no-bootstrap", "false"])), success);
  assert.equal(calls, 1);
});

test("missing selected CLI, a blocked turn and a mismatched supplied binding perform no I/O", async () => {
  let io = 0;
  let resolves = 0;
  const run = createQkrpcSchemaReadRunner({ binary: () => { resolves++; return null; },
    http: async () => { io++; return success; }, cli: async () => { io++; return success; } });
  assert.equal((await owned("cli", () => run(args))).ok, false);
  assert.equal(resolves, 1);
  await owned("cli", async () => {
    markQkrpcConnectivityBlockedThisTurn();
    assert.equal((await run(args)).ok, false);
  });
  assert.equal(resolves, 1);
  const other: QkrpcHostBinding = { ...binding, hostInstanceId: "another-owner" };
  assert.equal((await owned("cli", () => run(args, { hostBinding: other }))).ok, false);
  assert.equal(resolves, 1);
  assert.equal(io, 0);
});

test("HTTP unavailability and transient timeouts are returned after exactly one attempt", async () => {
  for (const response of [null, { ...success, ok: false, exitCode: -1, parsed: null, stderr: "timed out" }]) {
    let calls = 0;
    const run = createQkrpcSchemaReadRunner({ http: async () => { calls++; return response; },
      cli: async () => { assert.fail("no CLI fallback"); }, binary: () => { assert.fail("no binary staging"); } });
    assert.equal((await owned("http://127.0.0.1:1234", () => run(args))).ok, false);
    assert.equal(calls, 1);
  }
});

test("ignored read parameters, unknown contracts and truncated transport cannot masquerade as pages", async () => {
  for (const [response, code] of [
    [{ ...success, parsed: { action: "step-runner-get", payload: { success: true, schema: { old: true } } } }, "SCHEMA_READ_UNSUPPORTED"],
    [{ ...success, parsed: { action: "step-runner-get", payload: { schemaRead: { format: "future", status: "available" } } } }, "SCHEMA_READ_UNSUPPORTED"],
    [{ ...success, truncated: true }, "SCHEMA_READ_TRUNCATED"],
  ] as const) {
    let calls = 0;
    const run = createQkrpcSchemaReadRunner({ http: async () => { calls++; return response; } });
    const result = await owned("http://127.0.0.1:1234", () => run(args));
    assert.equal((result.parsed as { error: string }).error, code);
    assert.doesNotMatch(JSON.stringify(result), /current page|"old":true/);
    assert.equal(calls, 1);
  }
});

test("serve selector failures remain failed tool receipts even when the HTTP envelope succeeded", async () => {
  const response: QkrpcRunResult = { ...success, parsed: { ok: false, action: "step-runner-get", payload: {
    success: false, schemaRead: { format: STEP_RUNNER_SCHEMA_READ_FORMAT, status: "unavailable",
      error: { code: "SCHEMA_READ_STALE", message: "current definition changed" } },
  } } };
  const run = createQkrpcSchemaReadRunner({ http: async () => response });
  const result = await owned("http://127.0.0.1:1234", () => run(args));
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 1);
  assert.equal(result.parsed, response.parsed);
});

test("a page for a different request or observation is rejected without exposing its body", async () => {
  for (const changed of [
    { ...page, pointer: "/other", content: "foreign body" },
    { ...page, input: { ...page.input, controlField: "" }, content: "foreign body" },
    { ...page, input: { ...page.input, key: "sys:other" }, content: "foreign body" },
    { ...page, observation: "sha256:different", content: "foreign body" },
  ]) {
    const run = createQkrpcSchemaReadRunner({ http: async () => ({ ...success,
      parsed: { action: "step-runner-get", payload: { success: true, schemaRead: changed } } }) });
    const result = await owned("http://127.0.0.1:1234", () => run(args));
    assert.equal((result.parsed as { error: string }).error, "SCHEMA_READ_MISMATCH");
    assert.doesNotMatch(JSON.stringify(result), /foreign body/);
  }
  const run = createQkrpcSchemaReadRunner({ http: async () => success });
  const continuation = [...args.slice(0, -1), JSON.stringify({ pointer: "", mode: "children", offset: 0, expectedObservation: "sha256:old" })];
  assert.equal((await owned("http://127.0.0.1:1234", () => run(continuation))).ok, false);
});

test("the parent and explicit abort signals both discard late schema pages", async () => {
  for (const abortParent of [false, true]) {
    const parent = new AbortController();
    const explicit = new AbortController();
    const reason = new Error("cancel owned schema page");
    let calls = 0;
    const run = createQkrpcSchemaReadRunner({ http: async (_invoke, options) => {
      calls++;
      assert.ok(options?.abortSignal);
      (abortParent ? parent : explicit).abort(reason);
      return success;
    } });
    const state = createTurnExecutionState();
    await assert.rejects(runWithAgentRequestContextAsync({ executionState: state, abortSignal: parent.signal }, async () => {
      bindQkrpcTarget({ gateway: "http://127.0.0.1:1234", binding });
      return run(args, { abortSignal: explicit.signal });
    }), error => error === reason);
    assert.equal(calls, 1);
  }
});

test("a closed turn cannot publish a late page or poison another turn on the same conversation", async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const oldState = createTurnExecutionState();
  const oldRun = createQkrpcSchemaReadRunner({ http: async () => { await pending; return {
    ...success, parsed: { content: "obsolete schema body" },
  }; } });
  const oldRead = owned("http://127.0.0.1:1234", () => oldRun(args), oldState);
  disposeTurnExecutionState(oldState);
  const currentRun = createQkrpcSchemaReadRunner({ http: async () => success });
  assert.equal(await owned("http://127.0.0.1:5678", () => currentRun(args)), success);
  release();
  const late = await oldRead;
  assert.equal(late.ok, false);
  assert.doesNotMatch(JSON.stringify(late), /obsolete schema body/);
});

test("the actual HTTP adapter sends one bound read and retains numeric JSON fragment text", async () => {
  const requests: Record<string, unknown>[] = [];
  const content = '{"large":9007199254740993,"decimal":0.1000000000000000001,"negativeZero":-0}';
  const valuePage = { ...page, mode: "value", offsetUnit: "utf16", total: content.length,
    agentSchemaComplete: true, children: undefined, content,
    input: { ...page.input, read: { ...page.input.read, mode: "value" } },
  };
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", chunk => { body += chunk; });
    request.on("end", () => {
      assert.equal(request.url, "/v1/invoke");
      requests.push(JSON.parse(body));
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ ok: true, data: { ok: true, action: "step-runner-get",
        payload: { success: true, schemaRead: valuePage } } }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const run = createQkrpcSchemaReadRunner({ cli: async () => { assert.fail("no CLI"); },
      binary: () => { assert.fail("no binary staging"); } });
    const valueArgs = [...args.slice(0, -1), JSON.stringify({ pointer: "", mode: "value", offset: 0 })];
    const result = await owned(`http://127.0.0.1:${address.port}`, () => run(valueArgs));
    assert.equal(result.ok, true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].op, "step-runner.get");
    assert.deepEqual(requests[0].hostBinding, binding);
    assert.deepEqual((requests[0].args as Record<string, unknown>).read, { pointer: "", mode: "value", offset: 0 });
    assert.equal((result.parsed as { payload: { schemaRead: { content: string } } }).payload.schemaRead.content, content);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
