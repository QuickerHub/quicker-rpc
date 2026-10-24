import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { test, type TestContext } from "node:test";
import { beginShellSession, finishShellSession, getShellSession } from "../../../../lib/shell-session-registry.server";
import { GET } from "./route";

const result = (ok = true) => ({ ok, exitCode: ok ? 0 : 1, stdout: "fixture result", stderr: "", durationMs: 1,
  truncated: false, shell: "bash" as const, cwd: "/synthetic", commandLine: "synthetic snapshot; no process is launched" });

function setup(t: TestContext) {
  t.mock.timers.enable({ apis: ["setInterval"] });
  return { start: t.mock.method(globalThis, "setInterval"), clear: t.mock.method(globalThis, "clearInterval") };
}

function session(id: string) {
  beginShellSession({ id, commandLine: "synthetic snapshot; no process is launched", cwd: "/synthetic", shell: "fixture" });
  const abort = new AbortController();
  const req = new Request(`http://localhost/api/shell/watch?sessionId=${id}`, { signal: abort.signal });
  return { req, abort };
}

for (const ok of [true, false]) {
  test(`a completed ${ok ? "success" : "error"} snapshot closes synchronously without creating a heartbeat`, async (t) => {
    const timers = setup(t), id = `already-done-${ok}`, { req } = session(id);
    finishShellSession(id, result(ok));
    const response = await GET(req);
    const body = await response.text();
    assert.equal(body.match(/event: snapshot/g)?.length, 1);
    assert.match(body, new RegExp(`"status":"${ok ? "success" : "error"}"`));
    assert.equal(timers.start.mock.callCount(), 0);
    assert.equal(getEventListeners(req.signal, "abort").length, 0);
  });
}

test("a live terminal snapshot releases the heartbeat and abort listener immediately", async (t) => {
  const timers = setup(t), id = "live-completion", { req } = session(id);
  const response = await GET(req), reader = response.body!.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /"status":"running"/);
  finishShellSession(id, result());
  assert.match(new TextDecoder().decode((await reader.read()).value), /"status":"success"/);
  assert.equal((await reader.read()).done, true);
  assert.equal(timers.start.mock.callCount(), 1);
  assert.equal(timers.clear.mock.callCount(), 1);
  assert.equal(getEventListeners(req.signal, "abort").length, 0);
});

test("body cancellation releases its own resources without stopping the shell session", async (t) => {
  const timers = setup(t), id = "cancel-body", { req, abort } = session(id);
  const response = await GET(req);
  await response.body!.cancel();
  abort.abort();
  assert.equal(timers.clear.mock.callCount(), 1);
  assert.equal(getEventListeners(req.signal, "abort").length, 0);
  assert.equal(getShellSession(id)?.status, "running");
});

test("request abort closes the stream and releases resources exactly once", async (t) => {
  const timers = setup(t), id = "abort-request", { req, abort } = session(id);
  const response = await GET(req), reader = response.body!.getReader();
  await reader.read();
  abort.abort();
  assert.equal((await reader.read()).done, true);
  await reader.cancel();
  assert.equal(timers.clear.mock.callCount(), 1);
  assert.equal(getEventListeners(req.signal, "abort").length, 0);
});

test("an already aborted request allocates no subscription heartbeat and publishes no snapshot", async (t) => {
  const timers = setup(t), { req, abort } = session("pre-aborted");
  abort.abort();
  const response = await GET(req);
  assert.equal(await response.text(), "");
  assert.equal(timers.start.mock.callCount(), 0);
  assert.equal(getEventListeners(req.signal, "abort").length, 0);
});

test("canceling one response preserves another subscriber to the same running session", async (t) => {
  const timers = setup(t), id = "parallel-observers", { req } = session(id);
  const first = await GET(req);
  const second = await GET(new Request(req.url)), reader = second.body!.getReader();
  await reader.read();
  await first.body!.cancel();
  assert.equal(timers.clear.mock.callCount(), 1);
  t.mock.timers.tick(15_000);
  assert.equal(new TextDecoder().decode((await reader.read()).value), ": ping\n\n");
  finishShellSession(id, result());
  assert.match(new TextDecoder().decode((await reader.read()).value), /"status":"success"/);
  assert.equal((await reader.read()).done, true);
  assert.equal(timers.start.mock.callCount(), 2);
  assert.equal(timers.clear.mock.callCount(), 2);
});
