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
      mock.method(fs, "existsSync", () => true),
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
        shutdownBackends();
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
    killChildTree({ pid: 602, exitCode: 0, signalCode: null, kill() { killed.push("exit"); } });
    killChildTree({ pid: 602, exitCode: null, signalCode: "SIGTERM", kill() { killed.push("signal"); } });
    assert.deepEqual(killed, []);
  } finally {
    patch.mock.restore();
    syncBuiltinESMExports();
  }
});
