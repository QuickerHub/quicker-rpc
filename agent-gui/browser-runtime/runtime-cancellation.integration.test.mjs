import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { handleBrowserInvokeRequest } from "./invoke-request.mjs";
import { SessionManager } from "./session-manager.mjs";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function bounded(promise, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), 10_000);
    })]);
  } finally { clearTimeout(timer); }
}

// Opt-in only: launches its own Edge and uses only generated pages/profile plus an ephemeral loopback server.
test("actual HTTP disconnect cancels queued browser work while native evaluate retains its session tail", {
  skip: process.env.QKRPC_BROWSER_LIVE_ACCEPTANCE !== "1", timeout: 45_000,
}, async () => {
  const parent = resolve(dirname(fileURLToPath(import.meta.url)), "../../.tmp");
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, "browser-native-cancellation-"));
  console.log(`Browser cancellation evidence: ${root}`);
  const manager = new SessionManager({ headless: true, channel: "msedge", userDataDir: join(root, "browser-profile") });
  const gateReached = deferred();
  const seen = new Map();
  const signals = new Map();
  const sendJson = (res, status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body));
  };
  let gateResponse;
  const server = createServer((req, res) => {
    if (req.url === "/fixture") {
      res.writeHead(200, { "Content-Type": "text/html", "Content-Security-Policy": "default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'" });
      res.end('<!doctype html><title>Owned cancellation fixture</title><button onclick="document.body.dataset.clicks=String(Number(document.body.dataset.clicks||0)+1)">Keep</button>');
    } else if (req.url === "/native-gate") {
      gateResponse = res; gateReached.resolve();
    } else if (req.url === "/v1/invoke") {
      void handleBrowserInvokeRequest(req, res, (op, args, sessionId, options) => {
        const pending = manager.invoke(op, args, sessionId, options);
        if (args.acceptanceLabel) {
          signals.set(args.acceptanceLabel, options.abortSignal);
          seen.get(args.acceptanceLabel)?.resolve();
        }
        return pending;
      }, sendJson);
    } else { res.writeHead(404); res.end(); }
  });
  await new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => { server.removeListener("error", fail); done(); });
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const controllers = [];
  const pendingChecks = [];
  const track = (promise) => {
    // Observe early assertion failures immediately, retaining the original promise for its later assertion.
    void promise.catch(() => {});
    pendingChecks.push(promise);
    return promise;
  };
  const invoke = async (sessionId, op, args = {}, signal) => {
    const response = await fetch(origin + "/v1/invoke", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, op, args: { includePreview: false, ...args } }), signal });
    const result = await response.json();
    assert.equal(response.ok && result.ok, true, JSON.stringify(result));
    return result.data;
  };
  const abortObserved = (signal) => signal.aborted ? Promise.resolve()
    : new Promise((done) => signal.addEventListener("abort", done, { once: true }));
  let report;
  let ownedBrowser;
  let browserClosed = false;
  try {
    for (const id of ["a", "b"]) {
      await invoke(id, "session.ensure");
      ownedBrowser = manager._browser;
      await manager._sessions.get(id).context.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      await invoke(id, "page.navigate", { url: origin + "/fixture" });
    }
    const snapshot = await invoke("a", "page.snapshot");
    writeFileSync(join(root, "initial-snapshot.json"), JSON.stringify(snapshot, null, 2));
    const ref = snapshot.snapshot.match(/ref=(e[0-9]+)/)?.[1];
    assert.ok(ref, JSON.stringify(snapshot));
    const originalSession = manager._sessions.get("a");
    const button = await originalSession.page.getByRole("button", { name: "Keep" }).boundingBox();
    assert.ok(button);
    const picked = await invoke("a", "page.pick_element", { x: button.x + button.width / 2, y: button.y + button.height / 2 });
    assert.equal(picked.ref, ref, "The actual coordinate-picking script resolves the same interactive ref");
    const originalRefs = originalSession.refMap;
    for (const label of ["queued", "next"]) seen.set(label, deferred());
    const runningAbort = new AbortController();
    const runningReason = new Error("Stop the owned running request");
    controllers.push({ controller: runningAbort, reason: runningReason });
    const running = invoke("a", "page.evaluate", { script: `await fetch('/native-gate'); document.body.dataset.nativeFinished='yes'; return 'native finished';`, acceptanceLabel: "running" }, runningAbort.signal);
    const runningRejected = track(assert.rejects(running, (error) => error === runningReason));
    await bounded(gateReached.promise, "native evaluate reached its real HTTP gate");

    const queuedAbort = new AbortController();
    const queuedReason = new Error("Stop the owned queued request");
    controllers.push({ controller: queuedAbort, reason: queuedReason });
    const queued = invoke("a", "page.evaluate", { script: "document.body.dataset.queued='unexpected'", acceptanceLabel: "queued" }, queuedAbort.signal);
    const queuedRejected = track(assert.rejects(queued, (error) => error === queuedReason));
    await bounded(seen.get("queued").promise, "queued request accepted by the production manager");
    let nextSettled = false;
    const next = track(invoke("a", "page.evaluate", { script: "({nativeFinished:document.body.dataset.nativeFinished??null,queued:document.body.dataset.queued??null})", acceptanceLabel: "next" }));
    void next.then(() => { nextSettled = true; }, () => { nextSettled = true; });
    await bounded(seen.get("next").promise, "next request accepted by the production manager");
    runningAbort.abort(runningReason); queuedAbort.abort(queuedReason);
    await Promise.all([runningRejected, queuedRejected,
      bounded(abortObserved(signals.get("running")), "runtime observes running HTTP disconnect"),
      bounded(abortObserved(signals.get("queued")), "runtime observes queued HTTP disconnect")]);
    assert.equal(nextSettled, false, "Cancel must not release the still-running native operation's tail");
    const parallel = await invoke("b", "page.evaluate", { script: "({parallel:true})" });
    assert.deepEqual(parallel.value, { parallel: true });
    assert.equal(nextSettled, false, "Another session can complete while the original native gate is held");
    gateResponse.end("release native work");
    const after = await bounded(next, "next operation waits for native settlement");
    assert.deepEqual(after.value, { nativeFinished: "yes", queued: null });
    assert.equal(manager._sessions.get("a"), originalSession, "Cancelling a request preserves its shared context");
    assert.equal(originalSession.refMap, originalRefs, "Cancelled work does not publish replacement refs");
    await invoke("a", "page.click", { ref });
    const clicked = await invoke("a", "page.evaluate", { script: "({clicks:document.body.dataset.clicks})" });
    assert.deepEqual(clicked.value, { clicks: "1" }, "The preserved real page and refs remain usable");
    report = { ok: true, nativeRuntime: "Playwright/msedge", ephemeralLoopback: true, generatedProfile: true,
      runningHttpAbortObserved: true, queuedHttpAbortObserved: true, queuedNativeDispatch: false,
      nativeTailRetained: true, otherSessionIndependent: true, sharedContextPreserved: true, originalRefClickVerified: true,
      realSnapshotAndCoordinatePickVerified: true,
      nativeSideEffectsRolledBack: false, embeddedNativeVerified: false, hostOrModelUsed: false };
  } finally {
    if (gateResponse && !gateResponse.writableEnded) gateResponse.end();
    for (const { controller, reason } of controllers) controller.abort(reason);
    try { await manager.shutdown(); }
    finally {
      browserClosed = !ownedBrowser || !ownedBrowser.isConnected();
      try { if (!browserClosed) await ownedBrowser.close(); }
      finally {
        server.closeAllConnections();
        await new Promise((done) => server.close(done));
        await Promise.allSettled(pendingChecks);
      }
    }
  }
  assert.equal(browserClosed, true, "SessionManager shutdown closes its actual owned browser");
  assert.equal(manager.browserReady, false);
  assert.equal(manager.sessionCount, 0);
  writeFileSync(join(root, "verification.json"), JSON.stringify({ ...report, ownedBrowserClosed: browserClosed }, null, 2));
});
