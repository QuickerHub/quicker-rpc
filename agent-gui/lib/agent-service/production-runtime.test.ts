import assert from "node:assert/strict";
import { test } from "node:test";
import { createAgentRuntimeLoader } from "./production-runtime.server";

test("runtime ownership rejects another loader call and disposes each real resource once", async () => {
  const calls: string[] = [];
  const runTurn = () => Response.json({ ok: true });
  const load = createAgentRuntimeLoader(async () => ({
    runTurn,
    closeDatabase: () => { calls.push("db"); },
    stopBrowserRuntimes: () => { calls.push("browser"); },
    stopTerminalRuntimes: () => { calls.push("terminal"); },
  }));
  const runtime = await load();
  assert.equal(runtime.runTurn, runTurn);
  await assert.rejects(load(), /already owns/);
  await Promise.all([runtime.dispose(), runtime.dispose()]);
  assert.deepEqual(calls.sort(), ["browser", "db", "terminal"]);
  const next = await load();
  await next.dispose();
});

test("cleanup failures do not skip other resources or release a still-failed owner", async () => {
  const calls: string[] = [];
  const load = createAgentRuntimeLoader(async () => ({
    runTurn: () => Response.json({}),
    stopBrowserRuntimes: () => { calls.push("browser"); throw Error("fixture cleanup failed"); },
    stopTerminalRuntimes: () => { calls.push("terminal"); },
    closeDatabase: () => { calls.push("db"); },
  }));
  const runtime = await load();
  await assert.rejects(runtime.dispose(), AggregateError);
  assert.deepEqual(calls.sort(), ["browser", "db", "terminal"]);
  await assert.rejects(load(), /already owns/);
});
