import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  initializeSmokeIsolation, reserveSmokeUiPort, startSmokeRpcGuard,
  writeSmokeHandshake, waitForSmokeApproval, SMOKE_PROTOCOL,
} from "./smoke-isolation.mjs";

function fixture() {
  const root = resolve("fixture/smoke-run");
  const env = { QUICKER_AGENT_SMOKE_ROOT: root, QUICKER_AGENT_SMOKE_RUN_ID: "a".repeat(32) };
  for (const [key, suffix] of Object.entries({ APPDATA: "roaming", LOCALAPPDATA: "local", USERPROFILE: "home", HOME: "home", TEMP: "temp", TMP: "temp", AGENT_GUI_ROOT: "app-state", AGENT_GUI_DEFAULT_CWD: "workspace", QUICKER_AGENT_DATA_DIR: "data" })) env[key] = join(root, suffix);
  const paths = {};
  const app = { setPath: (name, path) => { paths[name] = path; } };
  const fs = { mkdirSync() {}, realpathSync: (path) => path };
  return { root, env, paths, app, fs };
}

test("normal startup does not access smoke filesystem or change Electron paths", () => {
  assert.equal(initializeSmokeIsolation({}, {}, { realpathSync() { throw Error("unexpected I/O"); } }), null);
});

test("explicit smoke isolates profiles before main modules load and rejects ambient/redirected paths", () => {
  const f = fixture();
  const smoke = initializeSmokeIsolation(f.app, f.env, f.fs);
  assert.equal(smoke.protocol, SMOKE_PROTOCOL);
  assert.deepEqual(f.paths, { appData: join(f.root, "roaming"), userData: join(f.root, "profile"), sessionData: join(f.root, "sessions"), logs: join(f.root, "logs") });
  assert.throws(() => initializeSmokeIsolation(f.app, { ...f.env, APPDATA: resolve("ambient-profile") }, f.fs), /APPDATA is not isolated/);
  assert.throws(() => initializeSmokeIsolation(f.app, { ...f.env, QUICKER_AGENT_DATA_DIR: resolve("ambient-data") }, f.fs), /QUICKER_AGENT_DATA_DIR is not isolated/);
  assert.throws(() => initializeSmokeIsolation(f.app, f.env, { ...f.fs, realpathSync: () => resolve("redirected") }), /Invalid isolated smoke/);
});

function fakeServer(fail = false) {
  const server = new EventEmitter();
  server.closed = 0;
  server.address = () => ({ port: 45123 });
  server.close = (done) => { server.closed += 1; done?.(); };
  server.closeAllConnections = () => {};
  server.listen = (port, host, ready) => { assert.equal(port, 0); assert.equal(host, "127.0.0.1"); queueMicrotask(() => fail ? server.emit("error", new Error("synthetic bind failure")) : ready()); };
  return server;
}

test("ephemeral UI reservation releases its socket on success and failure", async () => {
  const ready = fakeServer();
  assert.equal(await reserveSmokeUiPort(() => ready), 45123);
  assert.equal(ready.closed, 1);
  const failed = fakeServer(true);
  await assert.rejects(reserveSmokeUiPort(() => failed), /synthetic bind failure/);
  assert.equal(failed.closed, 1);
});

test("smoke RPC guard owns an ephemeral listener and rejects every invocation without a host", async () => {
  const server = fakeServer();
  let handler;
  const guard = await startSmokeRpcGuard((callback) => { handler = callback; return server; });
  for (const [method, url] of [["GET", "/health"], ["POST", "/invoke"], ["GET", "/anything"]]) {
    let status, body;
    handler({ method, url }, { writeHead(code) { status = code; }, end(text) { body = JSON.parse(text); } });
    assert.equal(status, 503);
    assert.equal(body.ok, false);
    if (url === "/health") assert.equal(body.hostRpcDisabled, true);
    else assert.equal(body.error, "SMOKE_HOST_RPC_DISABLED");
  }
  await guard.close();
  assert.equal(server.closed, 1);
});

test("handshake writes only the run directory and window approval requires matching run identity", async () => {
  const f = fixture();
  const smoke = initializeSmokeIsolation(f.app, f.env, f.fs);
  let written, payload;
  writeSmokeHandshake(smoke, { uiPort: 45123, uiPid: 123, rpcPort: 45124, rpcPid: process.pid }, {
    writeFileSync(path, text, options) { written = path; payload = JSON.parse(text); assert.equal(options.flag, "wx"); },
    renameSync(from, to) { assert.equal(from, written); assert.equal(to, join(f.root, "ready.json")); },
  });
  assert.equal(payload.hostRpcDisabled, true);
  assert.equal(payload.runId, f.env.QUICKER_AGENT_SMOKE_RUN_ID);
  let reads = 0;
  await waitForSmokeApproval(smoke, { read: () => {
    if (++reads === 1) throw Object.assign(new Error("not approved"), { code: "ENOENT" });
    return JSON.stringify({ protocol: SMOKE_PROTOCOL, runId: smoke.runId });
  }, sleep: async () => {} });
  await assert.rejects(waitForSmokeApproval(smoke, { read: () => '{"protocol":"other","runId":"wrong"}' }), /Invalid smoke approval/);
  await assert.rejects(waitForSmokeApproval(smoke, { timeoutMs: 0 }), /Timed out/);
});
