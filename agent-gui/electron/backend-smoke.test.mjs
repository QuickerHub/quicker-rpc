import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import { EventEmitter } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { resolve } from "node:path";
import { mock, test } from "node:test";

for (const failure of [false, true]) {
  test(`isolated backend ${failure ? "spawn failure" : "success"} owns only its Node child and RPC guard`, async () => {
    const previousProfile = process.env.QUICKER_AGENT_DATA_DIR;
    const profile = resolve("fixture", "dedicated profile");
    process.env.QUICKER_AGENT_DATA_DIR = profile;
    const servers = [];
    const spawned = [], killed = [], writes = [];
    const serverFactory = () => {
      const server = new EventEmitter();
      server.closed = 0;
      server.listen = (port, host, ready) => { assert.equal(port, 0); assert.equal(host, "127.0.0.1"); queueMicrotask(ready); };
      server.address = () => ({ port: 45000 + servers.indexOf(server) });
      server.close = (done) => { server.closed += 1; done?.(); };
      server.closeAllConnections = () => {};
      servers.push(server);
      return server;
    };
    const mocks = [
      mock.method(http, "createServer", serverFactory), mock.method(net, "createServer", serverFactory),
      mock.method(fs, "existsSync", (path) => !String(path).endsWith("runtime-manifest.json")),
      mock.method(fs, "writeFileSync", (path) => { writes.push(path); }), mock.method(fs, "renameSync", () => {}),
      mock.method(childProcess, "spawn", (executable, args, options) => {
        spawned.push({ executable, args, options });
        const child = Object.assign(new EventEmitter(), { pid: 602, kill() { killed.push(602); } });
        queueMicrotask(() => child.emit(failure ? "error" : "spawn", ...(failure ? [new Error("synthetic spawn failure")] : [])));
        return child;
      }),
      mock.method(childProcess, "spawnSync", (_exe, args) => { killed.push(Number(args[1])); return { status: 0 }; }),
    ];
    syncBuiltinESMExports();
    try {
      const { startProductionBackends, shutdownBackends } = await import(`./backend-spawn.mjs?smoke-fixture=${failure}`);
      const root = resolve("fixture/isolated-smoke");
      const pending = startProductionBackends({ appDir: resolve("fixture/app"), nodeExe: "fixture-node", qkrpcDir: "unused-host", smoke: { root, runId: "a".repeat(32) } });
      if (failure) await assert.rejects(pending, /synthetic spawn failure/);
      else {
        const result = await pending;
        assert.equal(result.uiPort, 45001);
        assert.equal(result.qkrpcPort, 45000);
        assert.equal(writes.length, 1);
        const shutdown = shutdownBackends();
        assert.equal(shutdown, shutdownBackends(), "reentrant quit/update callers share cleanup completion");
        await shutdown;
      }
      assert.equal(spawned.length, 1);
      assert.equal(spawned[0].executable, "fixture-node");
      assert.equal(spawned[0].options.env.QKRPC_HTTP_URL, "http://127.0.0.1:45000");
      assert.equal(spawned[0].options.env.QUICKER_AGENT_DATA_DIR, profile, "the shared normal/smoke child environment preserves the selected profile");
      assert.deepEqual(killed, [], "the launcher Job owner performs all smoke process cleanup");
      assert.ok(servers.every((server) => server.closed === 1));
    } finally {
      if (previousProfile === undefined) delete process.env.QUICKER_AGENT_DATA_DIR;
      else process.env.QUICKER_AGENT_DATA_DIR = previousProfile;
      for (const patch of mocks) patch.mock.restore();
      syncBuiltinESMExports();
    }
  });
}

test("backend cleanup never targets an exited child's numeric PID", async () => {
  const killed = [];
  const patch = mock.method(childProcess, "spawnSync", (_exe, args) => { killed.push(args); });
  syncBuiltinESMExports();
  try {
    const { killChildTree } = await import("./backend-spawn.mjs?smoke-fixture=exited");
    await killChildTree({ pid: 602, exitCode: 0, signalCode: null, kill() { killed.push("exit"); } });
    await killChildTree({ pid: 602, exitCode: null, signalCode: "SIGTERM", kill() { killed.push("signal"); } });
    assert.deepEqual(killed, []);
  } finally {
    patch.mock.restore();
    syncBuiltinESMExports();
  }
});

test("IPC shutdown waits for the child's actual exit before completing", async () => {
  const { stopAgentChild } = await import("./backend-spawn.mjs");
  const child = Object.assign(new EventEmitter(), { pid: 123456, connected: true, exitCode: null, signalCode: null,
    send(message, done) { assert.equal(message, "shutdown"); done(); },
  });
  let complete = false;
  const stopping = stopAgentChild(child).then(() => { complete = true; });
  await Promise.resolve();
  assert.equal(complete, false);
  child.exitCode = 0;
  child.emit("exit", 0);
  await stopping;
  assert.equal(complete, true);
});

test("a stalled force-stop stays asynchronous and times out without claiming backend exit", async () => {
  let commandStops = 0;
  let backendStops = 0;
  const commands = [];
  const patches = [
    mock.method(childProcess, "spawnSync", () => { throw new Error("Synchronous process termination is forbidden"); }),
    mock.method(childProcess, "spawn", (_exe, args) => {
      assert.deepEqual(args, ["/PID", "789012", "/T", "/F"]);
      const command = Object.assign(new EventEmitter(), { pid: 345678, exitCode: null, signalCode: null,
        kill() { commandStops++; this.signalCode = "SIGTERM"; queueMicrotask(() => this.emit("exit", null, "SIGTERM")); return true; },
      });
      commands.push(command);
      return command;
    }),
  ];
  syncBuiltinESMExports();
  try {
    const { stopAgentChild } = await import("./backend-spawn.mjs?stop-fixture=stalled");
    const child = Object.assign(new EventEmitter(), { pid: 789012, connected: false, exitCode: null, signalCode: null,
      kill() { backendStops++; return true; },
    });
    let eventLoopAdvanced = false;
    const progress = new Promise((done) => setImmediate(() => { eventLoopAdvanced = true; done(); }));
    const stopped = assert.rejects(stopAgentChild(child, 0, { forceTimeoutMs: 30 }), /did not exit|timed out/);
    await progress;
    assert.equal(eventLoopAdvanced, true);
    await stopped;
    assert.equal(child.exitCode, null);
    assert.equal(child.signalCode, null);
    assert.equal(child.listenerCount("exit"), 0);
    if (process.platform === "win32") { assert.equal(commands.length, 1); assert.equal(commandStops, 1); }
    else assert.equal(backendStops, 1);
    // The same retained backend can be retried after a failed stop.
    const retry = stopAgentChild(child, 0, { forceTimeoutMs: 30 });
    child.exitCode = 0;
    child.emit("exit", 0);
    await retry;
  } finally { for (const patch of patches) patch.mock.restore(); syncBuiltinESMExports(); }
});

test("late IPC failures cannot force-stop an exited backend and a synchronous send failure is bounded", async () => {
  const commands = [];
  const patch = mock.method(childProcess, "spawn", (_exe, args) => {
    commands.push(args);
    return Object.assign(new EventEmitter(), { pid: 234567, exitCode: null, signalCode: null,
      kill() { this.signalCode = "SIGTERM"; queueMicrotask(() => this.emit("exit", null, "SIGTERM")); return true; },
    });
  });
  syncBuiltinESMExports();
  try {
    const { stopAgentChild } = await import("./backend-spawn.mjs?stop-fixture=ipc");
    let callback;
    const child = Object.assign(new EventEmitter(), { pid: 789012, connected: true, exitCode: null, signalCode: null,
      send(_message, done) { callback = done; }, kill() { throw new Error("Exited backend must not be killed"); },
    });
    const stopped = stopAgentChild(child, 10, { forceTimeoutMs: 30 });
    child.exitCode = 0;
    child.emit("exit", 0);
    await stopped;
    callback(new Error("Late IPC channel error"));
    await new Promise((done) => setTimeout(done, 15));
    assert.deepEqual(commands, []);
    const disconnected = Object.assign(new EventEmitter(), { pid: 789012, connected: true, exitCode: null, signalCode: null,
      send() { throw new Error("IPC channel closed during send"); }, kill() { return true; },
    });
    await assert.rejects(stopAgentChild(disconnected, 5000, { forceTimeoutMs: 30 }), /did not exit|timed out/);
    assert.equal(disconnected.listenerCount("exit"), 0);
  } finally { patch.mock.restore(); syncBuiltinESMExports(); }
});

test("a successful force command still waits for the actual backend exit", async () => {
  const patch = mock.method(childProcess, "spawn", () => {
    const command = Object.assign(new EventEmitter(), { pid: 456789, exitCode: null, signalCode: null });
    queueMicrotask(() => { command.exitCode = 0; command.emit("exit", 0); });
    return command;
  });
  syncBuiltinESMExports();
  try {
    const { stopAgentChild } = await import("./backend-spawn.mjs?stop-fixture=force-success");
    const child = Object.assign(new EventEmitter(), { pid: 789012, connected: false, exitCode: null, signalCode: null, kill() { return true; } });
    let complete = false;
    const stopped = stopAgentChild(child, 0, { forceTimeoutMs: 100 }).then(() => { complete = true; });
    await new Promise((done) => setImmediate(done));
    assert.equal(complete, false);
    child.exitCode = 0;
    child.emit("exit", 0);
    await stopped;
    assert.equal(complete, true);
  } finally { patch.mock.restore(); syncBuiltinESMExports(); }
});

test("Windows taskkill cancellation errors remain bounded and preserve the original timeout", { skip: process.platform !== "win32" }, async () => {
  let command;
  const patch = mock.method(childProcess, "spawn", () => {
    command = Object.assign(new EventEmitter(), { pid: 456789, exitCode: null, signalCode: null,
      kill() { this.emit("error", new Error("fixture helper kill failed")); return false; },
    });
    return command;
  });
  syncBuiltinESMExports();
  try {
    const { killChildTree } = await import("./backend-spawn.mjs?stop-fixture=helper-cancel-error");
    await assert.rejects(killChildTree({ pid: 789012, exitCode: null, signalCode: null }, { timeoutMs: 20 }), /timed out/);
    command.emit("error", new Error("late helper termination error"));
    command.emit("close", null);
    assert.equal(command.listenerCount("error"), 0);
    assert.equal(command.listenerCount("exit"), 0);
  } finally { patch.mock.restore(); syncBuiltinESMExports(); }
});
