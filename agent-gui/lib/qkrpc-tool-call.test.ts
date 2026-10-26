import assert from "node:assert/strict";
import { test } from "node:test";
import { executeSingleQkrpcToolCall } from "./qkrpc-tool-call";
import type { QkrpcRunResult } from "./qkrpc-types";

const success: QkrpcRunResult = { ok: true, exitCode: 0, stdout: "", stderr: "", parsed: { ok: true }, truncated: false };
const disconnected: QkrpcRunResult = {
  ...success, ok: false, exitCode: 1, parsed: { ok: false, error: "PLUGIN_NOT_RUNNING" }, stderr: "pipe down",
};

test("source open/persistent save honor the existing turn gate while offline validation remains available", async () => {
  let calls = 0;
  let marks = 0;
  const dependencies = {
    isConnectivityBlocked: () => true, markConnectivityBlocked: () => { marks += 1; },
    run: async () => { calls += 1; return success; },
  };
  for (const args of [
    ["action", "open", "--dir", "fixture"], ["action", "save", "--dir", "fixture"],
    ["action", "open", "--dry-run"], ["subprogram", "save", "--dry-run"],
    ["action", "save", "--dry-run", "false"], ["action", "save", "--dry-run", "0"],
    ["action", "save", "--dry-run", "unknown"], ["action", "save", "--dry-run", "--dry-run", "false"],
    ["action", "save", "--dry-run", "--dry-run=false"], ["action", "save", "--dry-run", "--DRY-RUN=false"],
    ["action", "save", "--dry-run=true"], ["action", "save", "--dry-run=false"],
    ["guide", "unknown"],
  ]) {
    const result = await executeSingleQkrpcToolCall(args, {}, dependencies);
    assert.equal(result.ok, false);
    assert.equal((result.parsed as { status: string }).status, "connectivity_blocked");
  }
  assert.equal(calls, 0);
  assert.equal(await executeSingleQkrpcToolCall(["action", "save", "--dir", "fixture", "--dry-run"], {}, dependencies), success);
  assert.equal(await executeSingleQkrpcToolCall(["action", "save", "--dry-run", "true", "--dir", "fixture"], {}, dependencies), success);
  for (const operation of ["wait", "health", "ping"]) {
    assert.equal(await executeSingleQkrpcToolCall([operation], {}, dependencies), success);
  }
  for (const operation of ["get", "search"]) {
    assert.equal(await executeSingleQkrpcToolCall(["guide", operation, "--topic", "program-source"], {}, dependencies), success);
  }
  assert.equal(calls, 7);
  assert.equal(marks, 0);
});

test("a single failed live source attempt marks the gate and keeps exact failure payload", async () => {
  let blocked = false;
  let calls = 0;
  const dependencies = {
    isConnectivityBlocked: () => blocked, markConnectivityBlocked: () => { blocked = true; },
    run: async () => { calls += 1; return disconnected; },
  };
  const first = await executeSingleQkrpcToolCall(["action", "save", "--dir", "fixture"], {}, dependencies);
  assert.equal(first, disconnected);
  assert.equal(calls, 1);
  assert.equal(blocked, true);
  const second = await executeSingleQkrpcToolCall(["action", "open", "--dir", "other"], {}, dependencies);
  assert.equal(second.ok, false);
  assert.equal(calls, 1);
});

test("offline validation failures do not mark host connectivity and ambiguous writes are never retried", async () => {
  let marks = 0;
  let calls = 0;
  const timeout: QkrpcRunResult = { ...disconnected, parsed: null, exitCode: -1, stderr: "timed out after write" };
  const dependencies = {
    isConnectivityBlocked: () => false, markConnectivityBlocked: () => { marks += 1; },
    run: async (args: string[]) => { calls += 1; return args.includes("--dry-run") ? disconnected : timeout; },
  };
  assert.equal(await executeSingleQkrpcToolCall(["action", "save", "--dry-run"], {}, dependencies), disconnected);
  assert.equal(marks, 0);
  assert.equal(await executeSingleQkrpcToolCall(["action", "save"], {}, dependencies), timeout);
  assert.equal(calls, 2);
});

test("single-call wrapper observes cancellation before gate, before I/O, and after a late result", async () => {
  let calls = 0;
  const controller = new AbortController();
  const reason = new Error("cancel source");
  const dependencies = {
    isConnectivityBlocked: () => false, markConnectivityBlocked: () => {},
    run: async () => { calls += 1; controller.abort(reason); return success; },
  };
  await assert.rejects(executeSingleQkrpcToolCall(["action", "save"], { abortSignal: controller.signal }, dependencies), (error) => error === reason);
  assert.equal(calls, 1);
  await assert.rejects(executeSingleQkrpcToolCall(["action", "save"], { abortSignal: controller.signal }, dependencies), (error) => error === reason);
  assert.equal(calls, 1);
});
