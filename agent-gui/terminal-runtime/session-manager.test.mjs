import assert from "node:assert/strict";
import { dirname } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { getPtyPool } from "./pty-pool.mjs";
import { TerminalSessionManager } from "./session-manager.mjs";

function fixture(t, { exitDuringKill = false } = {}) {
  const cwd = dirname(fileURLToPath(import.meta.url));
  const messages = [];
  let exited, killCount = 0;
  const proc = {
    onData() {},
    onExit(callback) { assert.equal(exited, undefined); exited = callback; },
    resize() {},
    kill() { killCount++; if (exitDuringKill) exited({ exitCode: 0 }); },
  };
  const pool = getPtyPool();
  t.mock.method(pool, "take", () => ({ shell: "synthetic-shell", cwd, proc, buffer: "" }));
  t.mock.method(pool, "scheduleRefill", () => {});
  const manager = new TerminalSessionManager();
  const ws = { OPEN: 1, readyState: 1, send: text => messages.push(JSON.parse(text)) };
  const session = manager.createSession(ws, message => messages.push(message), {
    sessionId: "owned-session", cwd, cols: 80, rows: 24,
  });
  assert.ok(session); assert.equal(typeof exited, "function");
  assert.equal(manager.sessionCount, 1); assert.equal(session.status, "running");
  assert.equal(messages[0].type, "ready");
  t.after(() => manager.shutdown());
  return { manager, session, messages, exit: code => exited({ exitCode: code }), kills: () => killCount };
}

for (const exitCode of [0, 17]) test(`disposing a session exited with ${exitCode} through its real PTY callback does not kill it again`, t => {
  const f = fixture(t);
  f.exit(exitCode);
  assert.equal(f.session.status, "exited");
  assert.equal(f.session.exitCode, exitCode);
  assert.equal(f.manager.listSessions()[0].status, "exited");
  assert.deepEqual(f.messages.at(-1), { type: "exit", sessionId: "owned-session", code: exitCode });
  assert.equal(f.manager.disposeSession("owned-session"), true);
  assert.equal(f.kills(), 0);
  assert.equal(f.manager.sessionCount, 0);
  assert.deepEqual(f.manager.listSessions(), []);
});

test("live dispose kills once, repeated dispose is inert, and a late exit callback cannot revive the session", t => {
  const f = fixture(t);
  assert.equal(f.manager.disposeSession("owned-session"), true);
  assert.equal(f.kills(), 1);
  assert.equal(f.manager.disposeSession("owned-session"), false);
  assert.equal(f.kills(), 1);
  const sent = f.messages.length;
  f.exit(0);
  assert.equal(f.session.status, "exited", "the callback still follows the actual manager state path");
  assert.equal(f.messages.length, sent, "disposed subscribers cannot receive a late exit");
  assert.equal(f.manager.sessionCount, 0);
  assert.deepEqual(f.manager.listSessions(), []);
});

test("an exit callback delivered synchronously by kill cannot resurrect a disposing session", t => {
  const f = fixture(t, { exitDuringKill: true });
  const sent = f.messages.length;
  assert.equal(f.manager.disposeSession("owned-session"), true);
  assert.equal(f.kills(), 1);
  assert.equal(f.session.status, "exited");
  assert.equal(f.session.exitCode, 0);
  assert.equal(f.messages.length, sent, "subscribers detach before the live PTY is killed");
  assert.equal(f.manager.sessionCount, 0);
  assert.equal(f.manager.disposeSession("owned-session"), false);
  assert.equal(f.kills(), 1);
});
