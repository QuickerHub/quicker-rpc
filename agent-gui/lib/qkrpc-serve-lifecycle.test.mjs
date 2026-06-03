import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  clearQkrpcServeState,
  isProcessAlive,
  qkrpcServeStatePath,
  readQkrpcServeState,
  reconcileStaleQkrpcServe,
  writeQkrpcServeState,
} from "./qkrpc-serve-lifecycle.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FIXTURE_ROOT = join(HERE, ".test-fixtures", "qkrpc-serve-lifecycle");

function resetFixture() {
  rmSync(FIXTURE_ROOT, { recursive: true, force: true });
  mkdirSync(FIXTURE_ROOT, { recursive: true });
}

test("read/write qkrpc serve state roundtrip", () => {
  resetFixture();
  writeQkrpcServeState(FIXTURE_ROOT, {
    pid: 4242,
    ownerPid: process.pid,
    startedAt: 1,
    runtimeDir: join(FIXTURE_ROOT, ".runtime", "qkrpc"),
    port: 9477,
  });
  const state = readQkrpcServeState(FIXTURE_ROOT);
  assert.equal(state?.pid, 4242);
  assert.equal(state?.ownerPid, process.pid);
  assert.equal(state?.port, 9477);
  clearQkrpcServeState(FIXTURE_ROOT);
  assert.equal(readQkrpcServeState(FIXTURE_ROOT), null);
});

test("reconcile keeps state when owner is alive and serve pid is stale", () => {
  resetFixture();
  writeQkrpcServeState(FIXTURE_ROOT, {
    pid: 999_999,
    ownerPid: process.pid,
    startedAt: Date.now(),
    runtimeDir: join(FIXTURE_ROOT, ".runtime", "qkrpc"),
  });
  const killed = reconcileStaleQkrpcServe(FIXTURE_ROOT, {
    runtimeDir: join(FIXTURE_ROOT, ".runtime", "qkrpc"),
  });
  assert.equal(killed, false);
  assert.equal(readQkrpcServeState(FIXTURE_ROOT), null);
});

test("reconcile clears state for dead orphan pid", () => {
  resetFixture();
  writeQkrpcServeState(FIXTURE_ROOT, {
    pid: 999_999,
    ownerPid: 999_998,
    startedAt: Date.now(),
    runtimeDir: join(FIXTURE_ROOT, ".runtime", "qkrpc"),
  });
  assert.equal(isProcessAlive(999_999), false);
  assert.equal(isProcessAlive(999_998), false);
  const killed = reconcileStaleQkrpcServe(FIXTURE_ROOT, {
    runtimeDir: join(FIXTURE_ROOT, ".runtime", "qkrpc"),
  });
  assert.equal(killed, false);
  assert.equal(readQkrpcServeState(FIXTURE_ROOT), null);
});

test("reconcile ignores invalid state file", () => {
  resetFixture();
  mkdirSync(join(FIXTURE_ROOT, ".runtime"), { recursive: true });
  writeFileSync(qkrpcServeStatePath(FIXTURE_ROOT), "{not json", "utf8");
  assert.equal(readQkrpcServeState(FIXTURE_ROOT), null);
  const killed = reconcileStaleQkrpcServe(FIXTURE_ROOT);
  assert.equal(killed, false);
});
