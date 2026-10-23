import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { mock, test } from "node:test";
import { invokeQkrpcHttp } from "./qkrpc-http";
import {
  runQkrpc,
  runQkrpcCliDirect,
  runQkrpcForTool,
  runQkrpcWithPatchFileForTool,
} from "./qkrpc";
import { runWithAgentRequestContextAsync } from "./qkrpc-request-context";

const base = "http://qkrpc-cancellation.invalid:9477";

async function withFakeHttp(
  fetch: typeof globalThis.fetch,
  run: () => Promise<void>,
): Promise<void> {
  const previousFetch = globalThis.fetch;
  const previousBase = process.env.QKRPC_HTTP_URL;
  const previousMode = process.env.QKRPC_TRANSPORT;
  globalThis.fetch = fetch;
  process.env.QKRPC_HTTP_URL = base;
  process.env.QKRPC_TRANSPORT = "http";
  try { await run(); }
  finally {
    globalThis.fetch = previousFetch;
    if (previousBase === undefined) delete process.env.QKRPC_HTTP_URL;
    else process.env.QKRPC_HTTP_URL = previousBase;
    if (previousMode === undefined) delete process.env.QKRPC_TRANSPORT;
    else process.env.QKRPC_TRANSPORT = previousMode;
  }
}

function waitForAbort(signal: AbortSignal | null | undefined): Promise<Response> {
  assert.ok(signal);
  signal.throwIfAborted();
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

test("pre-cancelled HTTP and CLI calls perform no fetch or spawn", async () => {
  const controller = new AbortController();
  const reason = new Error("turn cancelled before transport");
  controller.abort(reason);
  let fetches = 0;
  let spawns = 0;
  const spawn = mock.method(childProcess, "spawn", () => { spawns += 1; throw new Error("Unexpected spawn"); });
  syncBuiltinESMExports();
  try {
    await withFakeHttp(async () => { fetches += 1; throw new Error("Unexpected fetch"); }, async () => {
      await runWithAgentRequestContextAsync({ abortSignal: controller.signal }, async () => {
        for (const run of [
          () => invokeQkrpcHttp({ op: "action.save", args: { dir: ".tmp/source" } }),
          () => runQkrpc(["action", "save", "--dir", ".tmp/source"]),
          () => runQkrpcCliDirect(["--unused"]),
          () => invokeQkrpcHttp({ op: "action.save", args: {} }, { abortSignal: new AbortController().signal }),
          () => runQkrpcCliDirect(["--unused"], { abortSignal: new AbortController().signal }),
          () => runQkrpcWithPatchFileForTool(["action", "patch"], {}),
        ]) await assert.rejects(run, (error: unknown) => error === reason);
      });
    });
    assert.equal(fetches, 0);
    assert.equal(spawns, 0);
  } finally {
    spawn.mock.restore();
    syncBuiltinESMExports();
  }
});

test("cancellation interrupts discovery without scanning another serve", async () => {
  const controller = new AbortController();
  const reason = new Error("cancel discovery");
  let begin!: () => void;
  const started = new Promise<void>((resolve) => { begin = resolve; });
  let requests = 0;
  await withFakeHttp(async (url, init) => {
    requests += 1;
    assert.equal(String(url), `${base}/health`);
    begin();
    return waitForAbort(init?.signal);
  }, async () => {
    const pending = invokeQkrpcHttp({ op: "action.save", args: {} }, { abortSignal: controller.signal });
    const rejected = assert.rejects(pending, (error: unknown) => error === reason);
    await started;
    controller.abort(reason);
    await rejected;
    assert.equal(requests, 1);
  });
});

test("an in-flight HTTP cancellation preserves its reason and never spawns fallback", async () => {
  const controller = new AbortController();
  const reason = new Error("cancel invoke");
  let begin!: () => void;
  const started = new Promise<void>((resolve) => { begin = resolve; });
  let invokes = 0;
  let spawns = 0;
  const spawn = mock.method(childProcess, "spawn", () => { spawns += 1; throw new Error("Unexpected fallback"); });
  syncBuiltinESMExports();
  try {
    await withFakeHttp(async (url, init) => {
      if (String(url) === `${base}/health`) return Response.json({ ok: true });
      assert.equal(String(url), `${base}/v1/invoke`);
      invokes += 1;
      begin();
      return waitForAbort(init?.signal);
    }, async () => {
      const pending = runQkrpc(["step-runner", "get", "--key", "sys:notify"], { abortSignal: controller.signal });
      const rejected = assert.rejects(pending, (error: unknown) => error === reason);
      await started;
      controller.abort(reason);
      await rejected;
      assert.equal(invokes, 1);
      assert.equal(spawns, 0);
    });
  } finally {
    spawn.mock.restore();
    syncBuiltinESMExports();
  }
});

test("cancellation stops ordinary and JSON-payload retry backoff", async () => {
  for (const payload of [false, true]) {
    const controller = new AbortController();
    const reason = new Error("cancel retry delay");
    let invokes = 0;
    await withFakeHttp(async (url) => {
      if (String(url) === `${base}/health`) return Response.json({ ok: true });
      assert.equal(String(url), `${base}/v1/invoke`);
      invokes += 1;
      setImmediate(() => controller.abort(reason));
      return Response.json({ ok: false, error: "TIMEOUT", message: "request timed out" });
    }, async () => {
      const pending = payload
        ? runQkrpcWithPatchFileForTool(["action", "patch", "--id", "fixture"], {}, { abortSignal: controller.signal })
        : runQkrpcForTool(["action", "save", "--dir", ".tmp/source"], { abortSignal: controller.signal });
      await assert.rejects(pending, (error: unknown) => error === reason);
      assert.equal(invokes, 1);
    });
  }
});

test("HTTP timeout remains a timeout result rather than parent cancellation", async (context) => {
  let begin!: () => void;
  const started = new Promise<void>((resolve) => { begin = resolve; });
  await withFakeHttp(async (url, init) => {
    if (String(url) === `${base}/health`) return Response.json({ ok: true });
    begin();
    return waitForAbort(init?.signal);
  }, async () => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const pending = invokeQkrpcHttp({ op: "action.save", args: {} }, { timeoutMs: 10 });
      await started;
      context.mock.timers.tick(5_010);
      const result = await pending;
      assert.equal(result?.ok, false);
      assert.equal(result?.exitCode, -1);
      assert.match(result?.stderr ?? "", /timed out after 10ms/);
    } finally { context.mock.timers.reset(); }
  });
});

async function waitUntil(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!(await check())) {
    assert.ok(Date.now() < deadline, "Owned child did not reach the expected state.");
    await delay(10);
  }
}

test("CLI cancellation terminates only its owned child and inherits the turn signal", async () => {
  const directory = await mkdtemp(join(tmpdir(), "qka-cli-cancel-"));
  const previousBin = process.env.QKRPC_BIN;
  process.env.QKRPC_BIN = process.execPath;
  const other = childProcess.spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true });
  const controller = new AbortController();
  const reason = new Error("cancel owned child");
  const marker = join(directory, "owned.pid");
  const script = "require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000);";
  try {
    const pending = runWithAgentRequestContextAsync({ cwd: directory, abortSignal: controller.signal }, () =>
      runQkrpcCliDirect(["-e", script, marker], { json: false }),
    );
    const rejected = assert.rejects(pending, (error: unknown) => error === reason);
    await waitUntil(() => existsSync(marker));
    const pid = Number(await readFile(marker, "utf8"));
    controller.abort(reason);
    await rejected;
    await waitUntil(() => { try { process.kill(pid, 0); return false; } catch { return true; } });
    assert.equal(other.exitCode, null);
    assert.ok(other.pid);
    assert.equal(process.kill(other.pid, 0), true);
  } finally {
    controller.abort(reason);
    other.kill();
    if (previousBin === undefined) delete process.env.QKRPC_BIN;
    else process.env.QKRPC_BIN = previousBin;
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 20 });
  }
});
