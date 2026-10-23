import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import * as browser from "./browser-runtime-lifecycle.mjs";
import * as terminal from "./terminal-runtime-lifecycle.mjs";

const base = fileURLToPath(new URL("../../../../.tmp/", import.meta.url));
mkdirSync(base, { recursive: true });
const adapters = [
  { name: "browser", track: browser.trackBrowserRuntimeChild, stop: browser.stopTrackedBrowserRuntime,
    stopOwned: browser.stopOwnedBrowserRuntimes, read: browser.readBrowserRuntimeState, write: browser.writeBrowserRuntimeState },
  { name: "terminal", track: terminal.trackTerminalRuntimeChild, stop: terminal.stopTrackedTerminalRuntime,
    stopOwned: terminal.stopOwnedTerminalRuntimes, read: terminal.readTerminalRuntimeState, write: terminal.writeTerminalRuntimeState },
];

function fixture(t) {
  const root = mkdtempSync(join(base, "runtime-owned-children-"));
  const killed = [], errors = [], children = new Map();
  const behavior = { deny: false, autoExit: true };
  const child = (pid, fields = {}) => {
    const owned = Object.assign(new EventEmitter(), { pid, killed: false, exitCode: null, signalCode: null }, fields);
    children.set(pid, owned);
    return owned;
  };
  const exit = (owned) => { owned.exitCode = 0; owned.emit("exit", 0, null); };
  const kill = (pid) => {
    const owned = children.get(pid);
    assert.ok(owned, `unexpected OS process operation: ${pid}`);
    killed.push(pid);
    if (behavior.deny) throw Object.assign(new Error("fake access denied"), { code: "EACCES" });
    if (behavior.autoExit) queueMicrotask(() => exit(owned));
    return true;
  };
  // Real lifecycle exports, with every OS process operation intercepted.
  t.mock.method(childProcess, "execSync", (command) => {
    const match = /taskkill \/PID (\d+) \/T \/F/.exec(command);
    assert.ok(match, `unexpected command: ${command}`);
    kill(Number(match[1]));
    return "";
  });
  t.mock.method(childProcess, "spawn", (_command, args) => {
    assert.equal(_command, "taskkill");
    const request = new EventEmitter();
    request.kill = () => true;
    queueMicrotask(() => {
      try { kill(Number(args[1])); request.emit("exit", 0); }
      catch { request.emit("exit", 1); }
    });
    return request;
  });
  t.mock.method(process, "kill", (pid, signal) => {
    assert.equal(signal, "SIGTERM");
    return kill(Math.abs(pid));
  });
  t.mock.method(console, "error", (...args) => errors.push(args));
  syncBuiltinESMExports();
  t.after(async () => {
    for (const owned of children.values()) exit(owned);
    await Promise.all(adapters.map((adapter) => adapter.stopOwned()));
    await new Promise((done) => setImmediate(done));
    t.mock.restoreAll();
    syncBuiltinESMExports();
    const suffix = relative(resolve(base), resolve(root));
    assert.ok(suffix && suffix !== ".." && !suffix.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(suffix));
    rmSync(root, { recursive: true, force: true });
  });
  return { root, killed, errors, behavior, child, exit };
}

for (const a of adapters) {
  test(`${a.name}: concurrent stop waits for exit and is idempotent`, async (t) => {
    const { root, killed, child } = fixture(t);
    const owned = child(911001);
    a.track(root, owned); a.track(root, owned);
    assert.equal(owned.listenerCount("exit"), 1);
    const first = a.stopOwned(), second = a.stopOwned();
    assert.equal(a.read(root).ownerPid, process.pid);
    assert.equal(owned.exitCode, null);
    await Promise.all([first, second]);
    a.stop(root, owned); await a.stopOwned();
    assert.deepEqual(killed, [owned.pid]);
    assert.equal(a.read(root), null);
    assert.equal(owned.listenerCount("exit"), 0);
  });

  test(`${a.name}: exit codes skip kill; a sent signal alone does not`, async (t) => {
    const { root, killed, child } = fixture(t);
    for (const fields of [{ exitCode: 0 }, { signalCode: "SIGTERM" }]) {
      const owned = child(911002); a.track(root, owned); Object.assign(owned, fields);
      await a.stopOwned(); assert.equal(a.read(root), null);
    }
    assert.deepEqual(killed, []);
    const signaled = child(911003, { killed: true }); a.track(root, signaled);
    await a.stopOwned(); assert.deepEqual(killed, [signaled.pid]);
    a.track(root, child(911004, { exitCode: 0 })); await a.stopOwned();
    assert.equal(a.read(root), null);
  });

  test(`${a.name}: reused unregistered services are never killed or cleared`, async (t) => {
    const { root, killed, child } = fixture(t);
    const state = { pid: 911005, ownerPid: process.pid + 1000, startedAt: 42, port: 45123 };
    a.write(root, state); await a.stopOwned(); a.stop(root, undefined); a.stop(root, child(state.pid));
    assert.deepEqual(killed, []); assert.deepEqual(a.read(root), state);
  });

  test(`${a.name}: earlier stop or exit preserves replacement state`, async (t) => {
    const { root, killed, child, exit } = fixture(t);
    const earlier = child(911006), replacement = child(911007);
    a.track(root, earlier); a.track(root, replacement); const state = a.read(root);
    a.stop(root, earlier); await Promise.resolve(); assert.deepEqual(a.read(root), state);
    exit(replacement); await a.stopOwned();
    assert.deepEqual(killed, [earlier.pid]); assert.equal(a.read(root), null);
  });

  test(`${a.name}: same PID under another owner survives stop and exit`, async (t) => {
    const { root, killed, child, exit } = fixture(t);
    for (const operation of ["stop", "exit"]) {
      const owned = child(911008); a.track(root, owned);
      const state = { pid: owned.pid, ownerPid: process.pid + 1000, startedAt: 43, port: 45124 };
      a.write(root, state);
      if (operation === "stop") await a.stopOwned(); else exit(owned);
      assert.deepEqual(a.read(root), state);
    }
    await a.stopOwned(); assert.deepEqual(killed, [911008]);
  });

  test(`${a.name}: wrong-root stop changes neither state`, async (t) => {
    const { root, killed, child } = fixture(t);
    const owned = child(911009), otherRoot = join(root, "other");
    const foreign = { pid: 911010, ownerPid: process.pid + 1000, startedAt: 44, port: 45125 };
    a.track(root, owned); const ownState = a.read(root); a.write(otherRoot, foreign);
    a.stop(otherRoot, owned);
    assert.deepEqual(killed, []); assert.deepEqual(a.read(root), ownState); assert.deepEqual(a.read(otherRoot), foreign);
    await a.stopOwned(); assert.equal(a.read(root), null); assert.deepEqual(a.read(otherRoot), foreign);
  });

  test(`${a.name}: access denial keeps ownership and allows successful retry`, async (t) => {
    const { root, killed, child, behavior } = fixture(t);
    const owned = child(911011); a.track(root, owned); const state = a.read(root);
    behavior.deny = true; await assert.rejects(a.stopOwned(), AggregateError);
    assert.deepEqual(a.read(root), state); assert.equal(owned.listenerCount("exit"), 1);
    behavior.deny = false; await a.stopOwned();
    assert.equal(a.read(root), null); assert.ok(killed.length >= 2);
  });

  test(`${a.name}: exit timeout preserves the retryable owner`, async (t) => {
    const { root, child, behavior, killed } = fixture(t);
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const owned = child(911012); a.track(root, owned); const state = a.read(root);
    behavior.autoExit = false;
    const rejected = assert.rejects(a.stopOwned(), (error) => {
      assert.ok(error instanceof AggregateError); assert.match(error.errors[0].message, /did not exit/); return true;
    });
    await Promise.resolve(); await Promise.resolve();
    t.mock.timers.tick(2000); await rejected;
    assert.deepEqual(a.read(root), state); assert.equal(owned.listenerCount("exit"), 1);
    behavior.autoExit = true; await a.stopOwned();
    assert.deepEqual(killed, [owned.pid, owned.pid]); assert.equal(a.read(root), null);
  });

  test(`${a.name}: late exit after timeout releases the retained owner`, async (t) => {
    const { root, child, behavior, exit, killed } = fixture(t);
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const owned = child(911013); a.track(root, owned); behavior.autoExit = false;
    const rejected = assert.rejects(a.stopOwned(), AggregateError);
    await Promise.resolve(); await Promise.resolve();
    t.mock.timers.tick(2000); await rejected; assert.ok(a.read(root));
    exit(owned); assert.equal(a.read(root), null); await a.stopOwned(); assert.deepEqual(killed, [owned.pid]);
  });

  test(`${a.name}: legacy void stop reports failure without losing the service owner`, async (t) => {
    const { root, child, behavior, errors } = fixture(t);
    const owned = child(911014); a.track(root, owned); behavior.deny = true;
    assert.equal(a.stop(root, owned), undefined); await new Promise((done) => setImmediate(done));
    assert.equal(errors.length, 1); assert.ok(a.read(root)); assert.equal(owned.listenerCount("exit"), 1);
    behavior.deny = false; await a.stopOwned(); assert.equal(a.read(root), null);
  });
}
