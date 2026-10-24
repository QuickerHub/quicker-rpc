import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

export async function runRuntimeStartStopCase(kind: "browser" | "terminal", phase: "initial-health" | "spawned-poll" | "rejected-health"): Promise<void> {
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
  if (phase === "spawned-poll") {
    await new Promise<void>((done) => { health.close(() => done()); });
    const runtimeDir = join(workspace, `${kind}-runtime`);
    mkdirSync(runtimeDir);
    writeFileSync(join(runtimeDir, "server.mjs"), `
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
  let request: Promise<unknown> | undefined;
  try {
    const { origin } = await event("ready");
    request = fetch(`${origin}/api/${kind}/runtime`, { method: "POST", signal: abort.signal }).catch(() => {});
    if (phase === "initial-health") await healthEntered;
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
    if (phase === "spawned-poll") assert.equal(JSON.parse(readFileSync(join(workspace, "fixture-runtime-exit.json"), "utf8")).graceful, true);
  } finally {
    abort.abort();
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
    await request;
    health.closeAllConnections();
    await new Promise<void>((done) => { health.close(() => done()); });
    writeFileSync(join(root, "result.json"), JSON.stringify({ kind, phase, root, stopped, elapsed, forced, exitCode: child.exitCode, signalCode: child.signalCode, stdout, stderr }, null, 2));
  }
}
