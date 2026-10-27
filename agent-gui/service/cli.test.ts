import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { EventEmitter } from "node:events";
import { parseAgentServiceOptions } from "./cli";
import { runOwnedServiceStartup } from "./startup-lifecycle";

test("service defaults are ephemeral loopback and explicit ports are validated", () => {
  assert.deepEqual(parseAgentServiceOptions([]), { host: "127.0.0.1", port: 0, help: false });
  assert.deepEqual(parseAgentServiceOptions(["--host", "::1", "--port", "12345"]), { host: "::1", port: 12345, help: false });
  for (const args of [["--host", "0.0.0.0"], ["--port", "-1"], ["--port", "2.5"], ["--port", "65536"], ["--port"], ["--unknown"]]) {
    assert.throws(() => parseAgentServiceOptions(args));
  }
});

test("data-dir requires an absolute dedicated profile without altering default options", () => {
  const profile = resolve(".tmp", "service profile");
  assert.equal(parseAgentServiceOptions(["--data-dir", profile]).dataDir, profile);
  for (const args of [["--data-dir"], ["--data-dir", "relative/profile"], ["--data-dir", " "]]) {
    assert.throws(() => parseAgentServiceOptions(args), /absolute|Missing value/);
  }
  if (process.platform === "win32") assert.throws(() => parseAgentServiceOptions(["--data-dir", "\\profile"]), /absolute/);
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

class LifecycleProcess extends EventEmitter {
  disconnectCalls = 0;
  disconnectError: Error | undefined;
  constructor(public connected: boolean | undefined) { super(); }
  disconnect() {
    this.disconnectCalls++;
    if (this.disconnectError) throw this.disconnectError;
    this.connected = false;
    this.emit("disconnect");
  }
  parentDisconnected() { this.connected = false; this.emit("disconnect"); }
}

function lifecycleProcess(connected: boolean | undefined = true) {
  const parent = new LifecycleProcess(connected);
  const foreign = () => {};
  const names = ["SIGINT", "SIGTERM", "message", "disconnect"];
  for (const name of names) parent.on(name, foreign);
  return { parent, assertReleased() {
    for (const name of names) assert.deepEqual(parent.listeners(name), [foreign], `${name}: only the unrelated listener remains`);
  } };
}

test("startup skips all allocation for IPC disconnected before entry, even without a send function", { timeout: 5_000 }, async () => {
  const fixture = lifecycleProcess(false);
  let starts = 0, ready = 0;
  await runOwnedServiceStartup({ process: fixture.parent,
    start: () => { starts++; return { stop() { assert.fail("No service was started"); } }; },
    onReady: () => { ready++; },
  });
  assert.equal(starts, 0); assert.equal(ready, 0); assert.equal(fixture.parent.disconnectCalls, 0);
  fixture.assertReleased();
});

test("ordinary CLI without an IPC connected property starts and remains owned until a signal", { timeout: 5_000 }, async () => {
  const fixture = lifecycleProcess(), ready = deferred<void>();
  fixture.parent.connected = undefined;
  let starts = 0, stops = 0, finished = false;
  const running = runOwnedServiceStartup({ process: fixture.parent,
    start: () => { starts++; return { stop() { stops++; } }; }, onReady: () => ready.resolve(),
  });
  void running.then(() => { finished = true; }, () => { finished = true; });
  await ready.promise;
  assert.equal(finished, false); assert.equal(starts, 1);
  fixture.parent.emit("SIGTERM"); await running;
  assert.equal(stops, 1); assert.equal(fixture.parent.disconnectCalls, 0); fixture.assertReleased();
});

test("an already buffered shutdown delivered on Node nextTick is consumed before startup", { timeout: 5_000 }, async () => {
  const fixture = lifecycleProcess();
  let starts = 0, ready = 0;
  const running = runOwnedServiceStartup({ process: fixture.parent,
    start: () => { starts++; return { stop() { assert.fail("No service was started"); } }; },
    onReady: () => { ready++; },
  });
  process.nextTick(() => fixture.parent.emit("message", "shutdown"));
  await running;
  assert.equal(starts, 0); assert.equal(ready, 0); assert.equal(fixture.parent.disconnectCalls, 1);
  fixture.assertReleased();
});

test("startup forwards cancellation to cooperative configure and load checkpoints", { timeout: 5_000 }, async () => {
  for (const phase of ["configure", "load"]) {
    const fixture = lifecycleProcess(), entered = deferred<void>(), configure = deferred<void>(), load = deferred<void>();
    let loadCalls = 0, serviceCalls = 0, signal: AbortSignal | undefined;
    if (phase === "load") configure.resolve();
    const running = runOwnedServiceStartup({ process: fixture.parent,
      start: async (abortSignal) => {
        signal = abortSignal;
        if (phase === "configure") entered.resolve();
        await configure.promise; abortSignal.throwIfAborted();
        loadCalls++;
        if (phase === "load") entered.resolve();
        await load.promise; abortSignal.throwIfAborted();
        serviceCalls++;
        return { stop() { assert.fail("The service stage must not run"); } };
      }, onReady: () => assert.fail("Canceled initialization cannot publish ready"),
    });
    await entered.promise; fixture.parent.emit("message", "shutdown");
    assert.equal(signal?.aborted, true);
    configure.resolve(); load.resolve(); await running;
    assert.equal(loadCalls, phase === "load" ? 1 : 0); assert.equal(serviceCalls, 0);
    assert.equal(fixture.parent.disconnectCalls, 1); fixture.assertReleased();
  }
});

test("cancel while startup is pending waits for the late owner and stops it without ready", { timeout: 5_000 }, async () => {
  const fixture = lifecycleProcess(), entered = deferred<void>(), late = deferred<{ stop(): void }>();
  let stops = 0, finished = false;
  const running = runOwnedServiceStartup({ process: fixture.parent,
    start: () => { entered.resolve(); return late.promise; },
    onReady: () => assert.fail("The late owner must not publish ready"),
  });
  void running.then(() => { finished = true; }, () => { finished = true; });
  await entered.promise; fixture.parent.emit("SIGINT");
  await new Promise<void>((done) => setImmediate(done));
  assert.equal(finished, false); assert.equal(fixture.parent.disconnectCalls, 0);
  late.resolve({ stop() { stops++; } }); await running;
  assert.equal(stops, 1); assert.equal(fixture.parent.disconnectCalls, 1); fixture.assertReleased();
});

test("repeated requests and synchronous abort/stop reentry retain one serial stop owner", { timeout: 5_000 }, async () => {
  const fixture = lifecycleProcess(), ready = deferred<void>(), stopping = deferred<void>(), releaseStop = deferred<void>();
  let stops = 0;
  const running = runOwnedServiceStartup({ process: fixture.parent,
    start: (signal) => {
      signal.addEventListener("abort", () => fixture.parent.emit("SIGTERM"), { once: true });
      return { async stop() {
        stops++; fixture.parent.emit("message", "shutdown"); stopping.resolve(); await releaseStop.promise;
      } };
    }, onReady: () => ready.resolve(),
  });
  await ready.promise;
  fixture.parent.emit("message", "not-shutdown"); assert.equal(stops, 0);
  fixture.parent.emit("message", "shutdown"); await stopping.promise;
  fixture.parent.emit("SIGINT"); fixture.parent.emit("SIGTERM"); fixture.parent.emit("message", "shutdown");
  assert.equal(stops, 1); assert.equal(fixture.parent.disconnectCalls, 0);
  releaseStop.resolve(); await running;
  assert.equal(stops, 1); assert.equal(fixture.parent.disconnectCalls, 1); fixture.assertReleased();
});

test("ready services stop on either their normal shutdown message or parent disconnect", { timeout: 5_000 }, async () => {
  for (const trigger of ["message", "disconnect"]) {
    const fixture = lifecycleProcess(), ready = deferred<void>();
    let stops = 0;
    const running = runOwnedServiceStartup({ process: fixture.parent,
      start: () => ({ stop() { stops++; } }), onReady: () => ready.resolve(),
    });
    await ready.promise;
    if (trigger === "message") fixture.parent.emit("message", "shutdown"); else fixture.parent.parentDisconnected();
    await running;
    assert.equal(stops, 1); assert.equal(fixture.parent.disconnectCalls, trigger === "message" ? 1 : 0);
    fixture.assertReleased();
  }
});

test("a genuine startup rejection remains an error when cancellation happens concurrently", { timeout: 5_000 }, async () => {
  const fixture = lifecycleProcess(), entered = deferred<void>(), startup = deferred<{ stop(): void }>();
  const original = new Error("real initialization failure");
  const running = runOwnedServiceStartup({ process: fixture.parent,
    start: () => { entered.resolve(); return startup.promise; }, onReady: () => assert.fail("Failed startup cannot publish ready"),
  });
  const rejected = assert.rejects(running, (error) => error === original);
  await entered.promise; fixture.parent.emit("SIGTERM"); startup.reject(original); await rejected;
  assert.equal(fixture.parent.disconnectCalls, 1); fixture.assertReleased();
});

test("ready publication failure preserves its stop and disconnect errors while removing only owned listeners", { timeout: 5_000 }, async () => {
  const fixture = lifecycleProcess();
  const original = new Error("ready publication failure"), stopError = new Error("owner stop failure"), disconnectError = new Error("IPC close failure");
  fixture.parent.disconnectError = disconnectError;
  let stops = 0;
  await assert.rejects(runOwnedServiceStartup({ process: fixture.parent,
    start: () => ({ stop() { stops++; throw stopError; } }), onReady: () => { throw original; },
  }), (error) => {
    assert.ok(error instanceof AggregateError); assert.deepEqual(error.errors, [original, stopError, disconnectError]); return true;
  });
  assert.equal(stops, 1); assert.equal(fixture.parent.disconnectCalls, 1); fixture.assertReleased();
});

test("a stop failure after intentional shutdown is not suppressed as cancellation", { timeout: 5_000 }, async () => {
  const fixture = lifecycleProcess(), original = new Error("real stop failure");
  let stops = 0;
  await assert.rejects(runOwnedServiceStartup({ process: fixture.parent,
    start: () => ({ stop() { stops++; throw original; } }),
    onReady: () => { fixture.parent.emit("message", "shutdown"); },
  }), (error) => error === original);
  assert.equal(stops, 1); assert.equal(fixture.parent.disconnectCalls, 1); fixture.assertReleased();
});
