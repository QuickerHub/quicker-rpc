import assert from "node:assert/strict";
import test from "node:test";
import { createMcpClientOwner } from "./client-owner";

test("independent MCP resources close even if one server never settles", async () => {
  const errors: unknown[] = [];
  const owner = createMcpClientOwner({ closeTimeoutMs: 5, onCloseError: (error) => errors.push(error) });
  const closed: string[] = [];
  await owner.register({ close: () => { closed.push("stalled-http"); return new Promise<void>(() => {}); } });
  await owner.register({ close: async () => { closed.push("stdio"); } });
  await owner.register({ close: async () => { closed.push("throwing"); throw new Error("close failed"); } });
  const disposing = owner.dispose();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(closed, ["stalled-http", "stdio", "throwing"]);
  await disposing;
  assert.equal(errors.length, 2);
  await owner.dispose();
  assert.equal(closed.length, 3);
});

test("late MCP client closes once after parent cancellation", async () => {
  const parent = new AbortController();
  const owner = createMcpClientOwner({ abortSignal: parent.signal, closeTimeoutMs: 5 });
  const reason = new Error("parent stopped");
  parent.abort(reason);
  await owner.dispose();
  assert.equal(owner.signal.reason, reason);
  let closed = 0;
  const client = { close: async () => { closed += 1; } };
  const close = await owner.register(client);
  await close();
  await (await owner.register(client))();
  assert.equal(closed, 1);
});

test("normal disposal detaches its parent cancellation listener", async () => {
  const parent = new AbortController();
  const owner = createMcpClientOwner({ abortSignal: parent.signal });
  await owner.dispose();
  const reason = owner.signal.reason;
  parent.abort(new Error("unrelated later cancellation"));
  assert.equal(owner.signal.reason, reason);
});
