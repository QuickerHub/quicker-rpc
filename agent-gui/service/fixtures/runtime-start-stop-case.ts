import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

export async function runRuntimeStartStopCase(kind: "browser" | "terminal", phase: "initial-health" | "spawned-poll" | "rejected-health" | "concurrent-ready"): Promise<void> {
  const concurrent = phase === "concurrent-ready";
  if (concurrent) assert.equal(kind, "terminal");
  const parent = resolve("../.tmp");
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, "runtime-start-stop-")), workspace = join(root, "workspace");
  mkdirSync(workspace);
  let healthStarted!: () => void;
  const healthEntered = new Promise<void>((done) => { healthStarted = done; });
  const health = createServer((_req, res) => {
    healthStarted();
    if (phase === "rejected-health") { res.writeHead(503); res.write("unconsumed health body"); }
  });
  await new Promise<void>((done) => { health.listen(0, "127.0.0.1", done); });
  const address = health.address();
  assert.ok(address && typeof address !== "string");
  if (phase === "spawned-poll" || concurrent) {
    await new Promise<void>((done) => { health.close(() => done()); });
    const runtimeDir = join(workspace, `${kind}-runtime`);
    mkdirSync(runtimeDir);
    const { RUNTIME_VERSION } = concurrent
      ? await import(new URL("../../terminal-runtime/config.mjs", import.meta.url).href) as { RUNTIME_VERSION: string }
      : { RUNTIME_VERSION: "unused" };
    writeFileSync(join(runtimeDir, "server.mjs"), concurrent ? `
import {createServer} from 'node:http';
import {appendFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const port=Number(process.argv[process.argv.indexOf('--port')+1]);
const facts={pid:process.pid,ppid:process.ppid,execPath:process.execPath,entry:fileURLToPath(import.meta.url),cwd:process.cwd(),runtimeOwner:process.env.QUICKER_AGENT_RUNTIME_OWNER};
appendFileSync(join(process.cwd(),'fixture-runtime-starts.ndjson'),JSON.stringify(facts)+'\\n');
let ready=false,stopping=false,reason;
const timer=setTimeout(()=>{ready=true;},120);
const server=createServer((_req,res)=>{res.writeHead(ready?200:503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:ready,runtimeVersion:${JSON.stringify(RUNTIME_VERSION)},runtimeOwner:process.env.QUICKER_AGENT_RUNTIME_OWNER}));});
server.listen(port,'127.0.0.1',()=>console.log('fixture-runtime-listening'));
function stop(value){if(stopping)return;stopping=true;reason=value;clearTimeout(timer);server.close(()=>{if(process.connected)process.disconnect();});server.closeAllConnections();}
process.on('message',m=>{if(m==='shutdown')stop('shutdown');});
process.once('disconnect',()=>stop('parent-disconnect'));
process.once('exit',code=>writeFileSync(join(process.cwd(),'fixture-runtime-exit.json'),JSON.stringify({...facts,graceful:stopping,reason,exitCode:code})));
` : `
import {createServer} from 'node:http';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
const port=Number(process.argv[process.argv.indexOf('--port')+1]);
const server=createServer((_req,res)=>{res.writeHead(503);res.end('{}');});
server.listen(port,'127.0.0.1',()=>console.log('fixture-runtime-listening'));
let stopping=false;
function stop(){if(stopping)return;stopping=true;server.close(()=>{writeFileSync(join(process.cwd(),'fixture-runtime-exit.json'),JSON.stringify({pid:process.pid,graceful:true}));if(process.connected)process.disconnect();});server.closeAllConnections();}
process.on('message',m=>{if(m==='shutdown')stop();});
process.once('disconnect',stop);
`);
  }
  const env: NodeJS.ProcessEnv = { NODE_ENV: "production" };
  for (const key of ["SystemRoot", "SystemDrive", "ComSpec", "PATH", "PATHEXT", "TEMP", "TMP"]) env[key] = process.env[key];
  Object.assign(env, {
    APPDATA: join(root, "roaming"), LOCALAPPDATA: join(root, "local"), HOME: join(root, "home"), USERPROFILE: join(root, "home"), XDG_DATA_HOME: join(root, "xdg"),
    QUICKER_AGENT_DATA_DIR: join(root, "profile"), AGENT_GUI_ROOT: join(root, "app"), AGENT_GUI_DEFAULT_CWD: workspace,
    AGENT_GUI_RUNTIME_STATE_DIR: join(root, "runtime-state"),
    LLM_CONFIG_PATH: join(root, "absent-llm.json"), BUNDLED_LLM_CONFIG_PATH: join(root, "absent-publish.json"), BUNDLED_LLM_DEV_CONFIG_PATH: join(root, "absent-dev.json"),
    BUNDLED_LLM_CONFIG: "{}", BUNDLED_LLM_REMOTE_CONFIG_DISABLED: "1", NODE_ENV: "production", HOSTNAME: "127.0.0.1",
    QUICKER_BROWSER_PORT: String(address.port), QUICKER_TERMINAL_PORT: String(address.port),
    FIXTURE_HEALTH_BASE: `http://127.0.0.1:${address.port}`, TSX_TSCONFIG_PATH: resolve("tsconfig.json"),
    ...(phase === "rejected-health" ? { FIXTURE_REJECTED_HEALTH: "1", AGENT_GUI_SKIP_BROWSER_RUNTIME: "1", AGENT_GUI_SKIP_TERMINAL_RUNTIME: "1" } : {}),
    ...(concurrent ? { QUICKER_AGENT_RUNTIME_OWNER: `terminal-cold-${randomUUID()}`, AGENT_GUI_SKIP_BROWSER_RUNTIME: "1" } : {}),
  });
  const child = spawn(process.execPath, [
    "--conditions=react-server", "--import", pathToFileURL(resolve("node_modules/tsx/dist/loader.mjs")).href,
    "--import", pathToFileURL(resolve("service/fixtures/runtime-start-network-guard.mjs")).href,
    resolve("service/fixtures/runtime-start-abort.ts"),
  ], { cwd: workspace, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  const exited = once(child, "exit");
  let stdout = "", stderr = "", forced = false;
  assert.ok(child.stdout && child.stderr);
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const event = async (name: string): Promise<{ origin: string; resources: string[] }> => {
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      for (const line of stdout.split(/\r?\n/)) {
        try { const value = JSON.parse(line); if (value.event === name) return value; } catch { /* Partial line. */ }
      }
      assert.equal(child.exitCode, null, `child exited before ${name}: ${stderr}`);
      assert.equal(child.signalCode, null, `child was terminated before ${name}: ${stderr}`);
      await delay(10);
    }
    throw Error(`No ${name} event: ${stderr}`);
  };
  const abort = new AbortController();
  let stopped: unknown, elapsed: number | undefined;
  let runtimeStart: { pid: number; ppid: number; execPath: string; entry: string; cwd: string; runtimeOwner: string } | undefined;
  let runtimeExit: unknown;
  const runtimeResponses: { status: number; body: unknown }[] = [];
  let request: Promise<unknown> | undefined;
  try {
    const { origin } = await event("ready");
    if (concurrent) {
      request = Promise.all(Array.from({ length: 6 }, (_, index) => fetch(`${origin}/api/terminal/runtime`, {
        method: index % 2 === 0 ? "GET" : "POST", signal: abort.signal,
      }).then(async response => ({ status: response.status, body: await response.json() }))));
      const responses = await request;
      assert.ok(Array.isArray(responses)); assert.equal(responses.length, 6);
      for (const response of responses) {
        runtimeResponses.push(response);
        assert.equal(response.status, 200);
        assert.equal(response.body.ok, true); assert.equal(response.body.base, env.FIXTURE_HEALTH_BASE);
        assert.equal(response.body.port, address.port); assert.equal(response.body.runtimeOwner, env.QUICKER_AGENT_RUNTIME_OWNER);
      }
      const starts = readFileSync(join(workspace, "fixture-runtime-starts.ndjson"), "utf8").trim().split(/\r?\n/).map(line => JSON.parse(line));
      assert.equal(starts.length, 1, "six cold HTTP observers must start exactly one actual runtime process");
      runtimeStart = starts[0]; assert.ok(runtimeStart);
      assert.equal(runtimeStart.ppid, child.pid); assert.equal(resolve(runtimeStart.execPath), resolve(process.execPath));
      assert.equal(resolve(runtimeStart.entry), join(workspace, "terminal-runtime/server.mjs")); assert.equal(resolve(runtimeStart.cwd), workspace);
      assert.equal(runtimeStart.runtimeOwner, env.QUICKER_AGENT_RUNTIME_OWNER);
      const state = JSON.parse(readFileSync(join(root, "runtime-state/terminal-runtime.json"), "utf8"));
      assert.equal(state.pid, runtimeStart.pid); assert.equal(state.ownerPid, child.pid); assert.equal(state.port, address.port);
    } else request = fetch(`${origin}/api/${kind}/runtime`, { method: "POST", signal: abort.signal }).catch(() => {});
    if (concurrent) { /* Full ready responses and child identity were checked above. */ }
    else if (phase === "initial-health") await healthEntered;
    else if (phase === "spawned-poll") {
      const deadline = Date.now() + 8_000;
      while (!stdout.includes("fixture-runtime-listening")) {
        if (Date.now() >= deadline) throw Error("Node runtime fixture did not start: " + stderr);
        await delay(10);
      }
      abort.abort();
      await request;
      await event("request-finished");
      const stillRunning = await fetch(`${env.FIXTURE_HEALTH_BASE}/health`);
      assert.equal(stillRunning.status, 503, "canceling one startup observer must not stop the service-owned runtime");
      await stillRunning.text();
    } else {
      const response = await request;
      assert.ok(response instanceof Response);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).ok, false);
    }
    const start = Date.now();
    const timer = setTimeout(() => { forced = true; child.kill(); }, 5_000);
    try { child.send("shutdown"); stopped = await event("stopped"); await exited; }
    finally { clearTimeout(timer); }
    elapsed = Date.now() - start;
    assert.equal(forced, false, stderr);
    assert.ok(elapsed < 5_000);
    assert.equal(child.exitCode, 0, stderr);
    assert.equal(stderr, "");
    if (concurrent) {
      const receipt = JSON.parse(readFileSync(join(workspace, "fixture-runtime-exit.json"), "utf8"));
      runtimeExit = receipt;
      assert.equal(receipt.pid, runtimeStart!.pid); assert.equal(receipt.graceful, true);
      assert.equal(receipt.reason, "shutdown"); assert.equal(receipt.exitCode, 0);
      assert.equal(readFileSync(join(workspace, "fixture-runtime-starts.ndjson"), "utf8").trim().split(/\r?\n/).length, 1);
      const listenerClosed = await fetch(`${env.FIXTURE_HEALTH_BASE}/health`, { signal: AbortSignal.timeout(1000) }).then(async response => {
        await response.body?.cancel(); return false;
      }, () => true);
      assert.equal(listenerClosed, true, "owned runtime listener must be closed before cleanup");
    }
    if (phase === "spawned-poll") assert.equal(JSON.parse(readFileSync(join(workspace, "fixture-runtime-exit.json"), "utf8")).graceful, true);
  } finally {
    abort.abort();
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
    await request?.catch(() => {});
    health.closeAllConnections();
    await new Promise<void>((done) => { health.close(() => done()); });
    writeFileSync(join(root, "result.json"), JSON.stringify({ kind, phase, root, stopped, elapsed, forced, exitCode: child.exitCode, signalCode: child.signalCode,
      ...(concurrent ? { runtimeStart, runtimeExit, runtimeResponses } : {}), stdout, stderr }, null, 2));
  }
}
