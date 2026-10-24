import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { PassThrough } from "node:stream";
import { mock, test } from "node:test";
import { getQkrpcOperationEffects, isOfflineSourceInvoke, isQkrpcInvokeReplaySafe } from "./qkrpc-operation-effects";
import { isQkrpcReadOnlyInvoke, type QkrpcHostBinding } from "./qkrpc-host-binding";
import { runWithAgentRequestContextAsync } from "./qkrpc-request-context";
import { runQkrpcForTool } from "./qkrpc";

const fixtureBinding: QkrpcHostBinding = {
  hostInstanceId: "instance-a", hostSessionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  endpoint: "QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  protocolVersion: 1, schemaVersion: 1, hostKind: "v1", quickerVersion: "fixture",
  capabilities: { "action.source.read": true, "action.source.write": true },
};

test("operation effects prevent generic CLI export retries after a lost acknowledgement while pure reads retain their policy", async () => {
  const keys = ["QKRPC_TRANSPORT", "QKRPC_BIN", "QKRPC_HOST_BINDING"];
  const previous = keys.map((key) => process.env[key]);
  process.env.QKRPC_TRANSPORT = "cli";
  process.env.QKRPC_BIN = process.execPath;
  process.env.QKRPC_HOST_BINDING = JSON.stringify(fixtureBinding);
  const calls: string[][] = [];
  const spawn = mock.method(childProcess, "spawn", (_bin: unknown, argv: unknown) => {
    calls.push(argv as string[]);
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill() {} });
    setImmediate(() => { child.emit("spawn"); child.stderr.write("fixture operation timeout"); child.emit("close", 1); });
    return child as unknown as ReturnType<typeof childProcess.spawn>;
  });
  syncBuiltinESMExports();
  try {
    for (const argv of [
      ["action", "open", "--id", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "--dir", ".tmp/fixture-only"],
      ["action", "extract", "--id", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "--dir", ".tmp/fixture-only"],
      ["subprogram", "export", "--id", "fixture-only", "--dir", ".tmp/fixture-only"],
    ]) {
      const before = calls.length;
      const result = await runWithAgentRequestContextAsync({}, () => runQkrpcForTool(argv));
      assert.equal(calls.length - before, 1, `${argv[0]} ${argv[1]} cannot be replayed after possible local persistence`);
      assert.equal((result.parsed as { error?: string })?.error, "WRITE_RESULT_UNKNOWN");
    }
    const before = calls.length;
    const read = await runWithAgentRequestContextAsync({}, () => runQkrpcForTool(["fa", "search", "--query", "fixture-only"]));
    assert.equal(calls.length - before, 3, "a pure invoke read keeps the existing bounded retry policy");
    assert.equal(read.ok, false);
    assert.ok(calls.every((argv) => argv.includes("--json")));
  } finally {
    spawn.mock.restore(); syncBuiltinESMExports();
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
  }
});

test("host-read binding and replay policy are distinct for persistent local exports", () => {
  const invoke = { op: "action.open", args: { id: "fixture", dir: ".tmp/fixture" } };
  assert.equal(isQkrpcReadOnlyInvoke(invoke), true);
  assert.equal(getQkrpcOperationEffects(invoke).mayPersistLocal, true);
  assert.equal(isQkrpcInvokeReplaySafe(invoke), false);
  // Pure invoke reads exclude tool wrappers' later workspace augmentation.
  assert.equal(isQkrpcInvokeReplaySafe({ op: "action.get", args: { id: "fixture" } }), true);
  assert.equal(Object.isFrozen(getQkrpcOperationEffects(invoke)), true);
});

test("runtime input contracts are host reads without local exports or mutation receipts", () => {
  const invoke = { op: "step-runner.input-contract", args: { key: "sys:fixture" } };
  assert.equal(isQkrpcReadOnlyInvoke(invoke), true);
  assert.equal(isQkrpcInvokeReplaySafe(invoke), true);
  assert.deepEqual(getQkrpcOperationEffects(invoke), { mayMutateHost: false, mayPersistLocal: false });
});

test("only explicit offline dry-run bypasses conservative write effects", () => {
  for (const dryRun of [undefined, false, "true", 1]) {
    const invoke = { op: "action.save", args: { dryRun } };
    assert.equal(isOfflineSourceInvoke(invoke), false);
    assert.equal(isQkrpcReadOnlyInvoke(invoke), false);
    assert.equal(isQkrpcInvokeReplaySafe(invoke), false);
  }
  for (const invoke of [{ op: "action.save", args: { dryRun: true } }, { op: "action.binding", args: {} }, { op: "guide.get", args: {} }]) {
    assert.equal(isQkrpcInvokeReplaySafe(invoke), true);
    assert.deepEqual(getQkrpcOperationEffects(invoke), { mayMutateHost: false, mayPersistLocal: false });
  }
  for (const op of ["fa.unknown", "action.new-operation", "__proto__", "toString"]) {
    assert.deepEqual(getQkrpcOperationEffects({ op, args: {} }), { mayMutateHost: true, mayPersistLocal: true });
    assert.equal(isQkrpcInvokeReplaySafe({ op, args: {} }), false);
  }
});
