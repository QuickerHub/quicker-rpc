// Explicit real Electron acceptance; connecting over CDP never closes the browser.
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url), { chromium } = require("playwright"), WebSocket = require("ws");
const config = JSON.parse(readFileSync(process.argv[2], "utf8"));
const evidence = { format: "quicker-agent.graceful-exit-driver.v1", epoch: config.epoch, exitEvents: [], errors: [] };
let socket, browser, page, nextId = 0;
const pending = new Map();
const until = async (fn, label, timeout = 20_000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await fn(); if (value) return value; await new Promise(done => setTimeout(done, 40)); }
  throw new Error(`Timed out: ${label}`);
};
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId, timer = setTimeout(() => { pending.delete(id); reject(new Error(`Inspector timeout: ${method}`)); }, 10_000);
  pending.set(id, { finish(error, value) { clearTimeout(timer); error ? reject(error) : resolve(value); } });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const result = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
try {
  const targets = await (await fetch(`http://127.0.0.1:${config.inspectPort}/json/list`)).json();
  assert.equal(targets.length, 1);
  socket = new WebSocket(targets[0].webSocketDebuggerUrl);
  await once(socket, "open");
  socket.on("message", raw => {
    const message = JSON.parse(raw), item = pending.get(message.id);
    if (item) { pending.delete(message.id); item.finish(message.error && new Error(message.error.message), message.result); }
  });
  evidence.native = await evaluate(`({pid:process.pid,packaged:globalThis.__QUICKER_ELECTRON__.app.isPackaged,version:globalThis.__QUICKER_ELECTRON__.app.getVersion(),userData:globalThis.__QUICKER_ELECTRON__.app.getPath('userData'),profile:process.env.QUICKER_AGENT_DATA_DIR})`);
  assert.equal(evidence.native.pid, config.info.rootPid);
  assert.equal(evidence.native.packaged, true, "acceptance must run the packed production shell");
  assert.equal(evidence.native.userData.toLowerCase(), config.info.userData.toLowerCase());
  assert.equal(evidence.native.profile.toLowerCase(), join(config.root, "data").toLowerCase());
  // Install the Chromium request guard before approving the first renderer load.
  await evaluate(`globalThis.__QUICKER_ELECTRON__.session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(request,done)=>done({cancel:!${JSON.stringify([config.origin, config.rpcOrigin])}.includes(new URL(request.url).origin)}));true`);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${config.debugPort}`);
  const context = browser.contexts()[0];
  const guard = await fetch(config.rpcOrigin + "/v1/invoke", { method: "POST", body: "{}" });
  assert.equal(guard.status, 503);
  assert.equal((await guard.json()).error, "SMOKE_HOST_RPC_DISABLED");
  evidence.hostRpcDisabled = true;
  const historyPath = config.origin + "/api/chat-store";
  if (config.epoch === 1) {
    const store = { version: 3, activeThreadId: "graceful-exit-fixture", activeWorkspaceId: "graceful-workspace",
      workspaces: [{ id: "graceful-workspace", label: "Graceful exit fixture", rootPath: join(config.root, "workspace") }],
      threads: [{ id: "graceful-exit-fixture", title: "Synthetic graceful exit history", updatedAt: 1, workingDirectory: join(config.root, "workspace"), messages: [{ id: "graceful-message", role: "user", parts: [{ type: "text", text: "Generated acceptance history" }] }] }],
      openTabIds: ["graceful-exit-fixture"], workingDirectory: join(config.root, "workspace") };
    assert.equal((await fetch(historyPath, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(store) })).ok, true);
  }
  const history = await (await fetch(historyPath + "?scope=all")).json();
  assert.equal(history.store.threads.find(thread => thread.id === "graceful-exit-fixture")?.title, "Synthetic graceful exit history");
  evidence.syntheticHistoryPresent = true;
  writeFileSync(join(config.root, "approved.json"), JSON.stringify({ protocol: config.protocol, runId: config.runId }));
  page = await until(() => context.pages().find(candidate => candidate.url() === config.origin + "/"), "production main renderer");
  page.on("pageerror", error => evidence.errors.push(error.message));
  await page.getByRole("textbox").first().waitFor({ state: "visible", timeout: 30_000 });
  assert.equal(await page.evaluate(() => window.__ELECTRON_WINDOW__.role), "main");
  await page.exposeFunction("recordGracefulExitEvent", (event) => evidence.exitEvents.push({ ...event, observedUtc: new Date().toISOString() }));
  await page.evaluate(() => {
    window.__ELECTRON__.on("app-request-exit", () => { void window.recordGracefulExitEvent({ event: "app-request-exit" }); });
  });
  evidence.runtime = {};
  const runtimeReplies = {};
  for (const kind of ["browser", "terminal"]) {
    const response = await fetch(config.origin + `/api/${kind}/runtime`, { method: "POST" });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.ok, true);
    const url = new URL(result.base);
    assert.equal(url.hostname, "127.0.0.1");
    assert.ok(!["3000", "9477", "6017", "6022"].includes(url.port));
    runtimeReplies[kind] = result;
  }
  const runtimeOwner = runtimeReplies.terminal.runtimeOwner;
  assert.match(runtimeOwner, /^[a-f0-9-]{36}$/i, "runtime state belongs to the service's current owner namespace");
  for (const kind of ["browser", "terminal"]) {
    const result = runtimeReplies[kind], url = new URL(result.base);
    // The native Job owner derives the current PID from this exact listener,
    // rather than treating a cached on-disk PID as process identity.
    evidence.runtime[kind] = { port: Number(url.port), base: result.base, runtimeOwner };
  }
  await page.screenshot({ path: join(config.root, `epoch-${config.epoch}-main.png`) });
  writeFileSync(join(config.root, `epoch-${config.epoch}-before-exit.json`), JSON.stringify(evidence, null, 2));
  await until(() => { try { return readFileSync(join(config.root, `epoch-${config.epoch}-exit-approved`), "utf8") === "approved"; } catch { return false; } }, "native owner retains all process handles", 90_000);
  for (const runtime of Object.values(evidence.runtime)) {
    const health = await (await fetch(runtime.base + "/health")).json();
    assert.equal(health.ok, true);
    assert.equal(health.runtimeOwner, runtimeOwner);
    runtime.health = health;
  }
  assert.deepEqual(evidence.errors, []);
  const disconnected = once(browser, "disconnected");
  evidence.triggerUtc = new Date().toISOString();
  evidence.trigger = "existing preload windowAction(close) -> app-request-exit -> React exit handler -> graceful_exit";
  await page.evaluate(() => window.__ELECTRON__.windowAction("close"));
  let timer;
  try { await Promise.race([disconnected, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Product exit exceeded 10s")), 10_000); })]); }
  finally { clearTimeout(timer); }
  assert.ok(evidence.exitEvents.some(event => event.event === "app-request-exit"));
  evidence.disconnectedUtc = new Date().toISOString();
  evidence.ok = true;
} catch (error) {
  evidence.ok = false; evidence.error = error.stack ?? String(error); process.exitCode = 1;
} finally {
  socket?.close();
  for (const item of pending.values()) item.finish(new Error("Driver finished"));
  pending.clear();
  writeFileSync(join(config.root, `epoch-${config.epoch}-driver.json`), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ ok: evidence.ok, error: evidence.error, trigger: evidence.trigger, runtime: evidence.runtime }));
  // No browser.close/app.exit/process termination shortcut. The retained Job is
  // disposed by PowerShell only after success evidence, or as failure containment.
  process.exit(process.exitCode ?? 0);
}
