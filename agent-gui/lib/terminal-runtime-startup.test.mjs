import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { RUNTIME_VERSION } from "../terminal-runtime/config.mjs";
import { ensureTerminalRuntime, readTerminalRuntimeState, stopOwnedTerminalRuntimes } from "./terminal-runtime-lifecycle.mjs";

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const turn = () => new Promise(done => setImmediate(done));

function fixture(t) {
  const parent = fileURLToPath(new URL("../../.tmp/terminal-cold-start-receipt/", import.meta.url));
  mkdirSync(parent, { recursive: true });
  const bucket = mkdtempSync(join(parent, "unit-")), root = join(bucket, "app");
  const children = [], shutdown = [], probes = [], spawnFailures = [], attempts = [];
  const pending = new Set(), waits = new Set(), endpoints = new Map(), roots = new Set();
  const controls = { sendError: false };
  const names = ["QUICKER_TERMINAL_PORT", "AGENT_GUI_TERMINAL_PORT", "AGENT_GUI_SKIP_TERMINAL_RUNTIME", "QUICKER_AGENT_RUNTIME_OWNER", "AGENT_GUI_RUNTIME_STATE_DIR"];
  const previous = new Map(names.map(name => [name, process.env[name]]));
  const makeRoot = name => {
    const path = name ? join(bucket, name) : root;
    mkdirSync(join(path, "terminal-runtime"), { recursive: true });
    writeFileSync(join(path, "terminal-runtime/server.mjs"), "// synthetic presence marker; never executed\n");
    roots.add(resolve(path)); return path;
  };
  makeRoot();
  const select = ({ owner = "terminal-startup-unit-owner", port = 45123, state = join(bucket, "state"), skip = false } = {}) => {
    Object.assign(process.env, { QUICKER_TERMINAL_PORT: String(port), QUICKER_AGENT_RUNTIME_OWNER: owner, AGENT_GUI_RUNTIME_STATE_DIR: state });
    if (skip) process.env.AGENT_GUI_SKIP_TERMINAL_RUNTIME = "1"; else delete process.env.AGENT_GUI_SKIP_TERMINAL_RUNTIME;
  };
  select();
  const endpoint = (port = 45123) => {
    const base = `http://127.0.0.1:${port}`;
    if (!endpoints.has(base)) endpoints.set(base, { initial: deferred(), initialEntered: deferred(), polling: deferred(), ready: deferred(), forceCold: false });
    return endpoints.get(base);
  };
  const wait = (promise, signal) => new Promise((done, fail) => {
    const entry = {};
    const cleanup = () => { waits.delete(entry); signal?.removeEventListener("abort", aborted); };
    const aborted = () => { cleanup(); fail(signal.reason); };
    if (signal?.aborted) { fail(signal.reason); return; }
    waits.add(entry); signal?.addEventListener("abort", aborted, { once: true });
    promise.then(value => { cleanup(); done(value); }, error => { cleanup(); fail(error); });
  });
  const exit = (child, code = 0) => { if (child.exitCode === null) { child.exitCode = code; child.connected = false; child.emit("exit", code, null); } };
  t.mock.method(childProcess, "spawn", (command, args, options) => {
    assert.equal(command, process.execPath);
    assert.ok(roots.has(options.cwd));
    assert.equal(args[0], join(options.cwd, "terminal-runtime/server.mjs"));
    const port = Number(args[args.indexOf("--port") + 1]);
    attempts.push({ root: options.cwd, port, owner: options.env.QUICKER_AGENT_RUNTIME_OWNER });
    const failure = spawnFailures.shift();
    if (failure instanceof Error) throw failure;
    const child = Object.assign(new EventEmitter(), { pid: failure === "no-pid" ? undefined : 921000 + children.length, exitCode: null, signalCode: null,
      base: `http://127.0.0.1:${port}`, owner: options.env.QUICKER_AGENT_RUNTIME_OWNER,
      connected: true, stdout: new EventEmitter(), stderr: new EventEmitter(), kill: () => assert.fail("unexpected child kill") });
    child.send = (message, callback) => { assert.equal(message, "shutdown"); shutdown.push(child.pid); queueMicrotask(() => {
      if (controls.sendError) callback?.(Error("controlled IPC stop failure")); else { callback?.(null); exit(child); }
    }); return true; };
    children.push(child); return child;
  });
  t.mock.method(childProcess, "execSync", () => assert.fail("unexpected OS command"));
  t.mock.method(process, "kill", (pid, signal) => {
    assert.equal(signal, 0, "only synthetic liveness checks are permitted");
    return pid === process.pid || children.some(child => child.pid === pid && child.exitCode === null);
  });
  syncBuiltinESMExports();
  t.mock.method(globalThis, "fetch", async (input, options) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.pathname, "/health");
    assert.ok(["45123", "45124"].includes(url.port));
    const ep = endpoint(Number(url.port));
    const child = children.find(child => child.base === url.origin && child.pid && child.exitCode === null);
    probes.push({ base: url.origin, signal: options?.signal });
    if (!child || ep.forceCold) {
      ep.initialEntered.resolve();
      await wait(ep.initial.promise, options?.signal);
      return Response.json({ ok: false });
    }
    ep.polling.resolve(); await wait(ep.ready.promise, options?.signal);
    // A body may arrive after the child exited: production must reject a dead
    // retained handle rather than adopting this deliberately stale response.
    const health = { ok: true, runtimeVersion: RUNTIME_VERSION, runtimeOwner: child.owner };
    if (controls.lateHealthError) {
      const error = controls.lateHealthError; controls.lateHealthError = undefined;
      return { ok: true, json: () => {
        // Let fetch-health and readiness finish their checks, then deliver the
        // child's error before the outer startup continuation publishes ready.
        queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => child.emit("error", error))));
        return Promise.resolve(health);
      } };
    }
    return Response.json(health);
  });
  t.after(async () => {
    controls.sendError = false;
    for (const ep of endpoints.values()) { ep.initial.resolve(); ep.ready.resolve(); }
    await Promise.allSettled([...pending]);
    await stopOwnedTerminalRuntimes();
    for (const child of children) exit(child);
    await turn();
    assert.equal(waits.size, 0, "all fake health observers must release their abort listeners");
    t.mock.restoreAll(); syncBuiltinESMExports();
    for (const [name, value] of previous) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    assert.equal(dirname(bucket), resolve(parent)); rmSync(bucket, { recursive: true, force: true });
  });
  const ensure = (path = root, signal) => {
    const result = ensureTerminalRuntime(path, "127.0.0.1", signal);
    pending.add(result); void result.then(() => pending.delete(result), () => pending.delete(result)); return result;
  };
  return { root, bucket, children, shutdown, probes, attempts, spawnFailures, controls, endpoint, select, makeRoot, ensure, exit, ...endpoint() };
}

test("same-owner concurrent cold terminal startup spawns one child and shares readiness", async t => {
  const f = fixture(t);
  const first = f.ensure(), second = f.ensure();
  const settled = Promise.allSettled([first, second]);
  try {
    await f.initialEntered.promise;
    f.initial.resolve();
    await f.polling.promise; await turn();
    assert.equal(f.children.length, 1, "parallel HTTP observers must not spawn competing terminal runtimes");
    f.ready.resolve();
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a, f.children[0]); assert.equal(b, a);
  } finally { f.initial.resolve(); f.ready.resolve(); await settled; }
});

test("pre-canceled terminal observer probes and spawns nothing", async t => {
  const f = fixture(t), abort = new AbortController(), reason = Error("already canceled");
  abort.abort(reason);
  await assert.rejects(f.ensure(f.root, abort.signal), error => error === reason);
  assert.equal(f.probes.length, 0); assert.equal(f.attempts.length, 0);
});

test("canceling the first observer does not cancel shared startup or the second observer", async t => {
  const f = fixture(t), a = new AbortController(), b = new AbortController(), reason = Error("first observer left");
  const first = f.ensure(f.root, a.signal), firstRejected = assert.rejects(first, error => error === reason);
  const second = f.ensure(f.root, b.signal); let secondSettled = false;
  void second.then(() => { secondSettled = true; }, () => { secondSettled = true; });
  f.initial.resolve(); await f.polling.promise; await turn();
  assert.equal(f.attempts.length, 1);
  a.abort(reason); await firstRejected;
  assert.equal(b.signal.aborted, false); assert.equal(secondSettled, false); assert.equal(f.children[0].exitCode, null);
  assert.equal(f.probes.at(-1).signal.aborted, false, "raw readiness is service-owned");
  f.ready.resolve(); assert.equal(await second, f.children[0]);
});

test("all observers may cancel while a later observer joins the retained startup", async t => {
  const f = fixture(t), a = new AbortController(), b = new AbortController();
  const first = f.ensure(f.root, a.signal), second = f.ensure(f.root, b.signal);
  const rejected = Promise.all([assert.rejects(first), assert.rejects(second)]);
  f.initial.resolve(); await f.polling.promise; await turn();
  a.abort(); b.abort(); await rejected;
  assert.equal(f.shutdown.length, 0); assert.equal(f.children[0].exitCode, null);
  const later = f.ensure(); await turn();
  assert.equal(f.attempts.length, 1);
  f.ready.resolve(); assert.equal(await later, f.children[0]);
});

for (const failure of ["throw", "no-pid"]) test(`shared ${failure} startup failure is retired so the same owner can retry`, async t => {
  const f = fixture(t), reason = Error("controlled spawn failure");
  f.spawnFailures.push(failure === "throw" ? reason : "no-pid");
  const first = f.ensure(), second = f.ensure(), results = Promise.allSettled([first, second]);
  f.initial.resolve();
  const outcomes = await results;
  assert.equal(f.attempts.length, 1);
  for (const result of outcomes) {
    if (failure === "throw") { assert.equal(result.status, "rejected"); assert.equal(result.reason, reason); }
    else { assert.equal(result.status, "fulfilled"); assert.equal(result.value, null); }
  }
  f.ready.resolve(); const replacement = await f.ensure();
  assert.equal(f.attempts.length, 2); assert.ok(replacement?.pid); assert.equal(replacement.exitCode, null);
});

test("a child exiting before readiness cannot be returned from a late healthy response or poison retry", async t => {
  const f = fixture(t), first = f.ensure(), outcome = Promise.allSettled([first]);
  f.initial.resolve(); await f.polling.promise;
  const dead = f.children[0]; f.exit(dead, 1); f.ready.resolve();
  const [result] = await outcome;
  assert.ok(result.status === "rejected" || result.value === null, "never fulfill with the exited child");
  assert.equal(readTerminalRuntimeState(f.root), null);
  const replacement = await f.ensure();
  assert.notEqual(replacement, dead); assert.ok(replacement?.pid); assert.equal(f.attempts.length, 2);
});

test("a late child error after healthy body settlement cannot publish the failed child", async t => {
  const f = fixture(t), first = f.ensure();
  f.initial.resolve(); await f.polling.promise;
  f.controls.lateHealthError = Error("late startup child error");
  f.ready.resolve();
  assert.equal(await first, null);
  assert.equal(f.children[0].exitCode, 0); assert.deepEqual(f.shutdown, [f.children[0].pid]);
  assert.equal(readTerminalRuntimeState(f.root), null);
});

for (const phase of ["initial-health", "post-spawn"]) test(`stop during ${phase} drains startup and prevents late spawn/ready publication`, async t => {
  const f = fixture(t), first = f.ensure(), outcome = Promise.allSettled([first]);
  if (phase === "initial-health") await f.initialEntered.promise;
  else { f.initial.resolve(); await f.polling.promise; }
  const stopping = stopOwnedTerminalRuntimes();
  const during = await Promise.allSettled([f.ensure()]);
  assert.equal(during[0].status, "rejected", "the stop barrier is installed synchronously");
  await stopping;
  const [result] = await outcome;
  assert.ok(result.status === "rejected" || result.value === null);
  const attempts = f.attempts.length;
  f.initial.resolve(); f.ready.resolve(); await turn();
  assert.equal(f.attempts.length, attempts); assert.equal(f.children.every(child => child.exitCode !== null), true);
  assert.equal(readTerminalRuntimeState(f.root), null);
  assert.equal(attempts, phase === "initial-health" ? 0 : 1);
});

test("a completed stop permits a fresh owner startup without reusing the former child", async t => {
  const f = fixture(t); f.initial.resolve(); f.ready.resolve();
  const old = await f.ensure(); await stopOwnedTerminalRuntimes();
  assert.equal(old.exitCode, 0); assert.deepEqual(f.shutdown, [old.pid]);
  f.select({ owner: "replacement-service-owner", state: join(f.bucket, "replacement-state") });
  const next = await f.ensure();
  assert.notEqual(next, old); assert.equal(next.owner, "replacement-service-owner"); assert.equal(f.attempts.length, 2);
});

for (const mismatch of ["root", "owner", "state"]) test(`an in-flight endpoint rejects a different ${mismatch} rather than joining or spawning`, async t => {
  const f = fixture(t), first = f.ensure();
  await f.initialEntered.promise;
  let path = f.root;
  if (mismatch === "root") path = f.makeRoot("other-app");
  if (mismatch === "owner") f.select({ owner: "foreign-owner" });
  if (mismatch === "state") f.select({ state: join(f.bucket, "other-state") });
  await assert.rejects(f.ensure(path));
  assert.equal(f.attempts.length, 0);
  f.select(); f.initial.resolve(); f.ready.resolve(); await first;
  assert.equal(f.attempts.length, 1);
});

test("different endpoints start independently and preserve their captured owner", async t => {
  const f = fixture(t), first = f.ensure();
  await f.initialEntered.promise;
  f.select({ port: 45124, owner: "other-endpoint-owner", state: join(f.bucket, "other-state") });
  const second = f.ensure(), other = f.endpoint(45124);
  f.initial.resolve(); f.ready.resolve(); other.initial.resolve(); other.ready.resolve();
  const [a, b] = await Promise.all([first, second]);
  assert.notEqual(a, b); assert.equal(a.owner, "terminal-startup-unit-owner"); assert.equal(b.owner, "other-endpoint-owner");
  assert.equal(f.attempts.length, 2);
  f.exit(a);
  assert.equal(readTerminalRuntimeState(f.root)?.pid, b.pid, "an old exit cannot clear the other captured state path");
  f.select();
  assert.equal(readTerminalRuntimeState(f.root), null, "the exited child cleans its own original state path");
});

test("failed cleanup retains the live child and blocks a competing replacement at its endpoint", async t => {
  const f = fixture(t); f.initial.resolve(); f.ready.resolve();
  const child = await f.ensure();
  f.controls.sendError = true; await assert.rejects(stopOwnedTerminalRuntimes(), AggregateError);
  assert.equal(child.exitCode, null); assert.ok(readTerminalRuntimeState(f.root));
  f.endpoint().forceCold = true;
  assert.equal(await f.ensure(), null); assert.equal(f.attempts.length, 1);
  f.controls.sendError = false; await stopOwnedTerminalRuntimes();
  assert.equal(child.exitCode, 0); assert.equal(readTerminalRuntimeState(f.root), null);
});
