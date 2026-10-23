import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { mock, test } from "node:test";
import { runWithAgentRequestContextAsync } from "./qkrpc-request-context";
import { runShellRequest } from "./shell-runner";
import { getShellSession } from "./shell-session-registry.server";

async function withFakeShell(run: (fixture: {
  directory: string;
  child: EventEmitter & { stdout: PassThrough; stderr: PassThrough };
  spawned: Promise<void>;
  spawns: () => number;
  kills: () => number;
  args: () => string[];
}) => Promise<void>, options?: { spawnError?: Error }): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "qka-shell-cancel-"));
  const env = Object.fromEntries(["AGENT_GUI_ROOT", "QKRPC_BIN", "LOCALAPPDATA"].map((key) => [key, process.env[key]]));
  process.env.AGENT_GUI_ROOT = join(directory, "agent-gui");
  process.env.QKRPC_BIN = process.execPath;
  process.env.LOCALAPPDATA = directory;
  let spawns = 0;
  let kills = 0;
  let args: string[] = [];
  let begin!: () => void;
  const spawned = new Promise<void>((resolve) => { begin = resolve; });
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(), stderr: new PassThrough(),
    kill: () => { kills += 1; queueMicrotask(() => child.emit("close", null)); return true; },
  });
  const spawn = mock.method(childProcess, "spawn", (_executable: string, argv: string[]) => {
    spawns += 1;
    args = argv;
    begin();
    if (options?.spawnError) throw options.spawnError;
    return child;
  });
  // PATH discovery stays fake; no shell, installed qkrpc or runtime staging is executed.
  const exec = mock.method(childProcess, "execSync", () => process.execPath);
  syncBuiltinESMExports();
  try {
    await run({ directory, child, spawned, spawns: () => spawns, kills: () => kills, args: () => args });
  } finally {
    spawn.mock.restore();
    exec.mock.restore();
    syncBuiltinESMExports();
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
}

test("pre-cancelled shell requests neither spawn nor materialize inline scripts", async () => {
  await withFakeShell(async (fixture) => {
    const controller = new AbortController();
    const reason = new Error("cancel before shell");
    controller.abort(reason);
    await assert.rejects(runWithAgentRequestContextAsync({ cwd: fixture.directory, abortSignal: controller.signal }, () =>
      runShellRequest({ mode: "script", script: "echo fixture" }, { abortSignal: new AbortController().signal }),
    ), (error: unknown) => error === reason);
    assert.equal(fixture.spawns(), 0);
    assert.equal(existsSync(join(fixture.directory, ".local")), false);
  });
});

test("shell cancellation closes its session and cleans only its inline script", async () => {
  await withFakeShell(async (fixture) => {
    const controller = new AbortController();
    const reason = new Error("cancel running shell");
    const sessionId = `cancel-${Date.now()}`;
    const pending = runWithAgentRequestContextAsync({ cwd: fixture.directory, abortSignal: controller.signal }, () =>
      runShellRequest({ mode: "script", script: "echo fixture" }, { sessionId }),
    );
    const rejected = assert.rejects(pending, (error: unknown) => error === reason);
    await fixture.spawned;
    const script = fixture.args().find((arg) => arg.includes("inline."));
    assert.ok(script && existsSync(script));
    fixture.child.stdout.write("partial output");
    controller.abort(reason);
    await rejected;
    assert.equal(fixture.kills(), 1);
    assert.equal(existsSync(script), false);
    const result = getShellSession(sessionId);
    assert.equal(result?.cancelled, true);
    assert.equal(result?.status, "error");
    assert.equal(result?.stdout, "partial output");
    fixture.child.stdout.write("late output");
    assert.equal(getShellSession(sessionId)?.stdout, "partial output");
  });
});

test("ordinary shell completion still returns captured output", async () => {
  await withFakeShell(async (fixture) => {
    const pending = runWithAgentRequestContextAsync({ cwd: fixture.directory }, () =>
      runShellRequest({ mode: "command", command: "echo fixture" }),
    );
    await fixture.spawned;
    fixture.child.stdout.write("fixture output");
    fixture.child.emit("close", 0);
    const result = await pending;
    assert.equal(result.ok, true);
    assert.equal(result.stdout, "fixture output");
    assert.equal(result.cancelled, undefined);
    assert.equal(fixture.kills(), 0);
  });
});

test("synchronous spawn failure preserves the error without starting a session", async () => {
  const failure = new Error("fake spawn failed synchronously");
  await withFakeShell(async (fixture) => {
    const sessionId = `spawn-failure-${Date.now()}`;
    await assert.rejects(runWithAgentRequestContextAsync({ cwd: fixture.directory }, () =>
      runShellRequest({ mode: "command", command: "echo fixture" }, { sessionId }),
    ), (error: unknown) => error === failure);
    assert.equal(fixture.spawns(), 1);
    assert.equal(fixture.kills(), 0);
    assert.equal(getShellSession(sessionId), null);
  }, { spawnError: failure });
});

test("environment construction failure starts neither a process nor a session", async () => {
  await withFakeShell(async (fixture) => {
    const failure = new Error("fake environment construction failed");
    const sessionId = `env-failure-${Date.now()}`;
    const env: Record<string, string> = {};
    Object.defineProperty(env, "FIXTURE_VALUE", {
      enumerable: true,
      get() { throw failure; },
    });
    await assert.rejects(runWithAgentRequestContextAsync({ cwd: fixture.directory }, () =>
      runShellRequest({ mode: "command", command: "echo fixture", env }, { sessionId }),
    ), (error: unknown) => error === failure);
    assert.equal(fixture.spawns(), 0);
    assert.equal(getShellSession(sessionId), null);
  });
});
