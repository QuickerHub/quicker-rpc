import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { PassThrough } from "node:stream";
import { mock, test } from "node:test";
import { runQkrpcSourceDocument } from "./qkrpc";
import { argvToInvoke } from "./qkrpc-argv";
import { currentQkrpcTarget } from "./qkrpc-host-binding";
import { markQkrpcConnectivityBlockedThisTurn } from "./qkrpc-connectivity-gate";
import { runWithAgentRequestContextAsync } from "./qkrpc-request-context";

async function env(mode: string, run: () => Promise<void>) {
  const keys = ["QKRPC_TRANSPORT", "QKRPC_HTTP_URL", "QKRPC_HOST_BINDING", "QKRPC_HOST_SESSION"];
  const previous = keys.map(key => process.env[key]);
  Object.assign(process.env, { QKRPC_TRANSPORT: mode, QKRPC_HTTP_URL: "http://127.0.0.1:1", QKRPC_HOST_BINDING: "invalid-on-purpose", QKRPC_HOST_SESSION: "not-a-host" });
  try { await run(); }
  finally { keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }); }
}

test("offline source HTTP modes bypass connectivity/bootstrap/discovery and preserve complete request text", async () => env("http", async () => {
  const fetch = globalThis.fetch, requests: Record<string, unknown>[] = [];
  const spawn = mock.method(childProcess, "spawn", () => { throw new Error("No process or CLI fallback is allowed"); });
  syncBuiltinESMExports();
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "http://127.0.0.1:1/v1/invoke");
    const request = JSON.parse(String(options?.body));
    assert.equal(request.op, "source.document"); assert.equal(Object.hasOwn(request, "hostBinding"), false);
    requests.push(request);
    return Response.json({ ok: true, data: { complete: true, editorJson: request.args.editorJson ?? "{}" } });
  };
  try {
    await runWithAgentRequestContextAsync({ cwd: process.cwd() }, async () => {
      markQkrpcConnectivityBlockedThisTurn();
      for (const mode of ["inspect", "preview", "save-local"]) {
        const editorJson = '{"opaque":9223372036854775807,"decimal":1.0000000000000001}';
        const result = await runQkrpcSourceDocument({ mode, dir: "owned", expectedSnapshot: "snapshot", editorJson, baselineEditorJson: editorJson });
        assert.equal(result.ok, true); assert.equal((result.parsed as { editorJson: string }).editorJson, editorJson);
        assert.equal(currentQkrpcTarget(), undefined);
      }
    });
    assert.equal(requests.length, 3);
    assert.ok(requests.every(request => (request.args as Record<string, unknown>).workspaceRoot === process.cwd()));
  } finally { globalThis.fetch = fetch; spawn.mock.restore(); syncBuiltinESMExports(); }
}));

test("offline CLI source protocol sends body only on stdin and keeps output beyond tool display limits", async () => env("cli", async () => {
  const body = '{"note":"`$(never-execute)","opaque":9223372036854775807}';
  const output = { ok: true, data: { editorJson: body, sourceYaml: "#".repeat(180_000) } };
  const calls: { args: string[]; input: string }[] = [];
  const spawn = mock.method(childProcess, "spawn", (_bin, argv) => {
    const call = { args: argv as string[], input: "" }; calls.push(call);
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill() {} });
    child.stdin.on("data", chunk => { call.input += String(chunk); });
    setImmediate(() => { child.emit("spawn"); child.stdout.end(JSON.stringify(output)); child.emit("close", 0); });
    return child as unknown as ReturnType<typeof childProcess.spawn>;
  });
  syncBuiltinESMExports();
  try {
    const args = { mode: "save-local", dir: "owned", expectedSnapshot: "snapshot", editorJson: body, baselineEditorJson: body };
    await runWithAgentRequestContextAsync({ cwd: process.cwd() }, async () => {
      markQkrpcConnectivityBlockedThisTurn();
      const result = await runQkrpcSourceDocument(args, { binaryPath: process.execPath });
      assert.equal(result.ok, true); assert.equal(result.truncated, false); assert.deepEqual(result.parsed, output);
      assert.equal(currentQkrpcTarget(), undefined);
    });
    assert.deepEqual(calls, [{ args: ["source", "document", "--json"], input: JSON.stringify(args) }]);
  } finally { spawn.mock.restore(); syncBuiltinESMExports(); }
}));

test("lost source local-save acknowledgements remain unknown without another dispatch", async () => env("cli", async () => {
  let calls = 0;
  const spawn = mock.method(childProcess, "spawn", () => {
    calls++;
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill() {} });
    setImmediate(() => { child.emit("spawn"); child.emit("close", 1); });
    return child as unknown as ReturnType<typeof childProcess.spawn>;
  });
  syncBuiltinESMExports();
  try {
    const result = await runQkrpcSourceDocument({ mode: "save-local", dir: "owned" }, { binaryPath: process.execPath });
    assert.equal(result.ok, false); assert.equal((result.parsed as { error: string }).error, "WRITE_RESULT_UNKNOWN");
    assert.equal(calls, 1);
  } finally { spawn.mock.restore(); syncBuiltinESMExports(); }
}));

test("source sync argv retains the exact snapshot CAS while existing action-save argv stays compatible", () => {
  assert.deepEqual(argvToInvoke(["action", "save", "--dir", "owned", "--dry-run"]), { op: "action.save", args: { dir: "owned", dryRun: true } });
  assert.deepEqual(argvToInvoke(["action", "save", "--dir", "owned", "--expected-source-snapshot", "sha256:exact"]), {
    op: "action.save", args: { dir: "owned", dryRun: false, expectedSnapshot: "sha256:exact" },
  });
});

test("source HTTP cancellation after dispatch stays unknown; cancellation before dispatch never contacts a port", async () => env("http", async () => {
  const fetch = globalThis.fetch, parent = new AbortController(); let calls = 0;
  globalThis.fetch = async () => { calls++; parent.abort(new Error("cancelled after dispatch")); throw parent.signal.reason; };
  try {
    const result = await runQkrpcSourceDocument({ mode: "save-local", dir: "owned" }, { abortSignal: parent.signal });
    assert.equal(result.ok, false); assert.equal((result.parsed as { error: string }).error, "WRITE_RESULT_UNKNOWN"); assert.equal(calls, 1);
    await assert.rejects(runQkrpcSourceDocument({ mode: "save-local", dir: "owned" }, { abortSignal: parent.signal }), /cancelled after dispatch/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = fetch; }
}));

test("source CLI cancellation after process dispatch stays unknown with no replay", async () => env("cli", async () => {
  const parent = new AbortController(); let calls = 0, killed = 0;
  const spawn = mock.method(childProcess, "spawn", () => {
    calls++;
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(),
      kill() { killed++; setImmediate(() => child.emit("close", 1)); return true; } });
    setImmediate(() => { child.emit("spawn"); parent.abort(new Error("cancelled after spawn")); });
    return child as unknown as ReturnType<typeof childProcess.spawn>;
  });
  syncBuiltinESMExports();
  try {
    const result = await runQkrpcSourceDocument({ mode: "save-local", dir: "owned" }, { binaryPath: process.execPath, abortSignal: parent.signal });
    assert.equal(result.ok, false); assert.equal((result.parsed as { error: string }).error, "WRITE_RESULT_UNKNOWN");
    assert.equal(calls, 1); assert.equal(killed, 1);
  } finally { spawn.mock.restore(); syncBuiltinESMExports(); }
}));
