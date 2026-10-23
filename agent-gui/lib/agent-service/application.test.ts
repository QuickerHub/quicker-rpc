import assert from "node:assert/strict";
import { test } from "node:test";
import { createAgentServiceApplication } from "./application";

const chat = () => new Request("http://agent.test/api/chat", { method: "POST", body: JSON.stringify({ messages: [] }) });

test("health and unsupported routes never load configuration or storage", async () => {
  let loads = 0;
  const app = createAgentServiceApplication({ loadRuntime: () => { loads++; throw Error("unexpected runtime import"); } });
  const health = await app.handle(new Request("http://agent.test/health"));
  assert.deepEqual(await health.json(), { ok: true, service: "quicker-agent", protocolVersion: 1, capabilities: ["chat"], runtime: "lazy" });
  assert.equal((await app.handle(new Request("http://agent.test/api/settings"))).status, 404);
  const method = await app.handle(new Request("http://agent.test/api/chat"));
  assert.equal(method.status, 405);
  assert.equal(method.headers.get("allow"), "POST");
  await app.dispose();
  assert.equal((await app.handle(chat())).status, 503);
  assert.equal(loads, 0);
});

test("parallel requests share one runtime while each turn keeps its own signal", async () => {
  let loads = 0, disposals = 0;
  const signals: AbortSignal[] = [];
  const app = createAgentServiceApplication({ loadRuntime: async () => {
    loads++;
    return { runTurn: async (_body, options) => { signals.push(options.abortSignal); return Response.json({ ok: true }); }, dispose: () => { disposals++; } };
  } });
  const responses = await Promise.all([app.handle(chat()), app.handle(chat())]);
  assert.ok(responses.every((response) => response.ok));
  assert.equal(loads, 1);
  assert.equal(signals.length, 2);
  assert.notEqual(signals[0], signals[1]);
  await Promise.all([app.dispose(), app.dispose()]);
  assert.equal(disposals, 1);
});

test("late runtime initialization is disposed and cannot execute a stopped request", async () => {
  let resolve!: (runtime: { runTurn: () => Response; dispose: () => void }) => void;
  let disposals = 0, turns = 0;
  let started!: () => void;
  const initialized = new Promise<void>((done) => { started = done; });
  const pending = new Promise<{ runTurn: () => Response; dispose: () => void }>((done) => { resolve = done; });
  const app = createAgentServiceApplication({ loadRuntime: () => { started(); return pending; } });
  const response = app.handle(chat());
  await initialized;
  await app.dispose();
  resolve({ runTurn: () => { turns++; return Response.json({ ok: true }); }, dispose: () => { disposals++; } });
  assert.equal((await response).status, 503);
  await app.dispose();
  assert.equal(disposals, 1);
  assert.equal(turns, 0);
});

test("failed initialization remains one failed owner and does not retry per request", async () => {
  let loads = 0;
  const app = createAgentServiceApplication({ loadRuntime: () => { loads++; throw Error("fixture init failed"); } });
  for (let index = 0; index < 2; index++) {
    const response = await app.handle(chat());
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "fixture init failed" });
  }
  assert.equal(loads, 1);
  await app.dispose();
});
