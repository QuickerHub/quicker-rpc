import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import { EventEmitter, once } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

// A prematurely restored per-test mock must never turn a fixture into a real port probe.
const realConnect = net.createConnection, realNetServer = net.createServer, realHttpServer = http.createServer;
const denyNetwork = () => { throw new Error("Desktop fixture denied a real network allocation"); };
net.createConnection = denyNetwork; net.createServer = denyNetwork; http.createServer = denyNetwork;
syncBuiltinESMExports();
const fixtureChildren = new Set();
after(async () => {
  for (const child of fixtureChildren) {
    if (child.exitCode != null || child.signalCode != null) continue;
    const exited = once(child, "exit"); child.kill(); await exited;
  }
  net.createConnection = realConnect; net.createServer = realNetServer; http.createServer = realHttpServer;
  syncBuiltinESMExports();
});

const tick = () => new Promise((done) => setImmediate(done));

for (const phase of ["port", "discovery-probe", "ui-probe", "retry-delay", "smoke-guard", "smoke-port", "spawn-error", "complete"]) {
test(`desktop startup/shutdown owns resources during ${phase}`, { timeout: 10_000 }, async (t) => {
  const parent = resolve("../.tmp"); fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(join(parent, "desktop-start-stop-")), appDir = join(root, "app");
  fs.mkdirSync(join(appDir, "lib"), { recursive: true });
  fs.mkdirSync(join(appDir, "renderer"));
  fs.writeFileSync(join(appDir, "runtime-manifest.json"), JSON.stringify({ format: "quicker-agent-static-runtime", version: 1, next: false }));
  fs.writeFileSync(join(appDir, "lib/service-main.mjs"), "// fixture marker");
  fs.writeFileSync(join(appDir, "renderer/index.html"), "fixture");
  const readyFile = join(root, "node-ready");
  fs.writeFileSync(join(appDir, "service.mjs"), `import {writeFileSync} from 'node:fs';process.on('message',m=>{if(m==='shutdown'&&process.connected)process.disconnect();});writeFileSync(${JSON.stringify(readyFile)},'ready');`);
  const original = Object.fromEntries(["QUICKER_AGENT_DATA_DIR", "APPDATA", "LOCALAPPDATA", "USERPROFILE", "HOME"].map((key) => [key, process.env[key]]));
  for (const key of Object.keys(original)) process.env[key] = join(root, key);
  const spawned = [], servers = [], probes = [], sockets = [], forced = [];
  const realSpawn = childProcess.spawn;
  let failedSpawn;
  let releasePort = () => {}, enterPort;
  const portEntered = new Promise((done) => { enterPort = done; });
  const waitForReady = async () => {
    const deadline = Date.now() + 2_000;
    while (!fs.existsSync(readyFile) && Date.now() < deadline) await new Promise((done) => setTimeout(done, 10));
  };
  const fakeServer = (kind) => {
    const server = new EventEmitter();
    server.closed = 0;
    server.listen = (_port, _host, ready) => {
      if (phase === "port" && kind === "net" || phase === "smoke-guard" && kind === "http" || phase === "smoke-port" && kind === "net") {
        let released = false; releasePort = () => { if (!released) { released = true; ready(); } }; enterPort();
      } else queueMicrotask(ready);
    };
    server.address = () => ({ port: 45000 + servers.indexOf(server) });
    server.close = (done) => { server.closed++; queueMicrotask(() => done?.()); };
    server.closeAllConnections = () => {};
    servers.push(server);
    return server;
  };
  const patches = [
    t.mock.method(net, "createConnection", (address, connected) => {
      probes.push(address);
      const socket = new EventEmitter();
      sockets.push(socket);
      socket.write = () => queueMicrotask(async () => {
        if (phase === "discovery-probe") { enterPort(); return; }
        if (address.port === 3000 && phase === "ui-probe") { await waitForReady(); enterPort(); return; }
        const retry = address.port === 3000 && phase === "retry-delay";
        socket.emit("data", Buffer.from(retry ? "HTTP/1.1 503 unavailable\r\n\r\n" : 'HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n{"ok":true}'));
        socket.emit("end");
        if (retry) { await waitForReady(); enterPort(); }
        if (phase === "complete" && address.port === 3000) { await waitForReady(); enterPort(); }
      });
      socket.setTimeout = () => socket;
      socket.destroy = () => { if (!socket.destroyed) { socket.destroyed = true; queueMicrotask(() => socket.emit("close")); } };
      queueMicrotask(connected);
      return socket;
    }),
    t.mock.method(net, "createServer", () => fakeServer("net")),
    t.mock.method(http, "createServer", () => fakeServer("http")),
    t.mock.method(childProcess, "spawn", (exe, args, options) => {
      if (exe === "taskkill") {
        assert.ok(spawned.some((child) => String(child.pid) === args[1]), "a fallback may only target this test's retained real child");
        forced.push(args);
        return Reflect.apply(realSpawn, childProcess, [exe, args, options]);
      }
      assert.equal(exe, process.execPath, "only the retained Node fixture may launch");
      assert.equal(args[0], join(appDir, "service.mjs"));
      if (phase === "spawn-error") {
        failedSpawn = Object.assign(new EventEmitter(), { pid: undefined, exitCode: null, signalCode: null, connected: false });
        queueMicrotask(enterPort);
        return failedSpawn;
      }
      const child = Reflect.apply(realSpawn, childProcess, [exe, args, options]);
      spawned.push(child);
      fixtureChildren.add(child);
      child.once("exit", () => fixtureChildren.delete(child));
      return child;
    }),
  ];
  syncBuiltinESMExports();
  const { startProductionBackends, shutdownBackends, stopAgentChild } = await import(`./backend-spawn.mjs?startup-race=${root}`);
  let startup, stopping, completedBeforePortRelease = false, startupResult;
  try {
    startup = startProductionBackends({ appDir, nodeExe: process.execPath, qkrpcDir: join(root, "absent-qkrpc"),
      ...(phase.startsWith("smoke-") ? { smoke: { root, runId: "a".repeat(32) } } : {}),
    });
    void startup.catch(() => {});
    await portEntered;
    await assert.rejects(startProductionBackends({}), /already started or starting/);
    if (phase === "complete") await startup;
    stopping = shutdownBackends();
    assert.equal(shutdownBackends(), stopping, "reentrant exits share the same drain");
    let stopped = false;
    void stopping.then(() => { stopped = true; }, () => {});
    await tick();
    completedBeforePortRelease = stopped;
    releasePort();
    startupResult = await Promise.allSettled([startup, stopping]);
    if (phase === "port" || phase.startsWith("smoke-")) assert.equal(completedBeforePortRelease, false, "shutdown cannot complete before the registered startup settles");
    assert.equal(spawned.length, ["ui-probe", "retry-delay", "complete"].includes(phase) ? 1 : 0, "cancellation never starts a late backend");
    assert.equal(startupResult[0].status, phase === "complete" ? "fulfilled" : "rejected");
    if (phase !== "complete") assert.equal(startupResult[0].reason.name, "BackendStartupCancelledError");
    assert.equal(startupResult[1].status, "fulfilled");
    assert.ok(spawned.every((child) => child.exitCode === 0), "shutdown waits for each retained child's actual IPC exit");
    assert.deepEqual(forced, []);
    if (failedSpawn) {
      assert.equal(failedSpawn.listenerCount("error"), 1, "a canceled spawn still observes its late OS error");
      failedSpawn.emit("error", new Error("late fixture spawn failure"));
      failedSpawn.emit("close", -1);
      assert.equal(failedSpawn.listenerCount("error"), 0);
      assert.equal(failedSpawn.listenerCount("spawn"), 0);
    }
    assert.ok(sockets.every((socket) => socket.destroyed), "probes release their sockets");
    assert.ok(servers.every((server) => server.closed === 1));
  } finally {
    releasePort?.();
    await Promise.allSettled([startup, stopping]);
    for (const child of spawned) {
      await waitForReady();
      await stopAgentChild(child);
    }
    fs.writeFileSync(join(root, "result.json"), JSON.stringify({ phase, completedBeforePortRelease, spawned: spawned.map((c) => ({ pid: c.pid, exitCode: c.exitCode })), probes, startupResult }, null, 2));
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    for (const patch of patches) patch.mock.restore();
    syncBuiltinESMExports();
  }
});
}

test("a quit before startup's first microtask allocates no backend resource", async () => {
  const { startProductionBackends, shutdownBackends, BackendStartupCancelledError } = await import("./backend-spawn.mjs?startup-pre-cancel");
  const startup = startProductionBackends({});
  const stopping = shutdownBackends();
  const [started, stopped] = await Promise.allSettled([startup, stopping]);
  assert.equal(started.status, "rejected");
  assert.ok(started.reason instanceof BackendStartupCancelledError);
  assert.equal(stopped.status, "fulfilled");
});

test("genuine startup failures are not reclassified as intentional quit", async () => {
  const { startProductionBackends } = await import("./backend-spawn.mjs?startup-real-failure");
  const failure = new Error("fixture resource resolution failed");
  const runtime = Object.defineProperty({}, "appDir", { get() { throw failure; } });
  await assert.rejects(startProductionBackends(runtime), (error) => error === failure);
});

test("awaiting shutdown releases startup ownership before an immediate restart", async () => {
  const { startProductionBackends, shutdownBackends, BackendStartupCancelledError } = await import("./backend-spawn.mjs?startup-immediate-retry");
  const first = startProductionBackends({});
  void first.catch(() => {});
  await shutdownBackends();
  const accepted = new Error("new startup accepted");
  const retry = Object.defineProperty({}, "appDir", { get() { throw accepted; } });
  await assert.rejects(startProductionBackends(retry), (error) => error === accepted);
  await assert.rejects(first, (error) => error instanceof BackendStartupCancelledError);
});
