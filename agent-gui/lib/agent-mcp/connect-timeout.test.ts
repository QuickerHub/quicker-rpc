import assert from "node:assert/strict";
import test from "node:test";
import { awaitMcpConnection } from "./connect-timeout";
import { createMcpClientOwner } from "./client-owner";
import { createMcpTransportFetch } from "./transport-fetch";
import { createMCPClient } from "@ai-sdk/mcp";

test("cancelled pending connection closes a client that arrives late", async () => {
  const parent = new AbortController();
  let connect!: (client: { close: () => Promise<void> }) => void;
  const pending = new Promise<{ close: () => Promise<void> }>((resolve) => { connect = resolve; });
  const result = awaitMcpConnection(pending, { serverName: "fixture", abortSignal: parent.signal });
  parent.abort();
  await assert.rejects(result, { name: "AbortError" });
  let closed = 0;
  connect({ close: async () => { closed += 1; } });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(closed, 1);
});

test("timeout also closes a late client", async () => {
  let connect!: (client: { close: () => Promise<void> }) => void;
  const pending = new Promise<{ close: () => Promise<void> }>((resolve) => { connect = resolve; });
  await assert.rejects(awaitMcpConnection(pending, { serverName: "fixture", timeoutMs: 1 }), /timed out/);
  let closed = 0;
  connect({ close: async () => { closed += 1; } });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(closed, 1);
});

test("successful connection transfers ownership without closing it", async () => {
  const parent = new AbortController();
  let closed = false;
  const client = { close: async () => { closed = true; } };
  assert.equal(await awaitMcpConnection(Promise.resolve(client), { serverName: "fixture", abortSignal: parent.signal }), client);
  parent.abort();
  assert.equal(closed, false);
});

test("initialization failure abandons its transport and preserves the original error", async () => {
  const reason = new Error("handshake failed");
  let abandoned = 0;
  await assert.rejects(awaitMcpConnection(Promise.reject(reason), {
    serverName: "fixture", onAbandon: () => { abandoned += 1; throw new Error("cleanup failed"); },
  }), (error) => error === reason);
  assert.equal(abandoned, 1);
});

test("real SDK SSE handshake failure aborts the stream before the caller resumes", async () => {
  const owner = createMcpClientOwner();
  const connection = new AbortController();
  let requestSignal: AbortSignal | undefined;
  let streamStopped = false;
  const fetch = createMcpTransportFetch({
    abortSignal: AbortSignal.any([owner.signal, connection.signal]),
    fetch: async (_input, init) => {
      requestSignal = init!.signal!;
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("event: endpoint\ndata: https://other.test/messages\n\n"));
          requestSignal!.addEventListener("abort", () => {
            streamStopped = true;
            controller.error(requestSignal!.reason);
          }, { once: true });
        },
      }), { headers: { "content-type": "text/event-stream" } });
    },
  });
  try {
    await assert.rejects(awaitMcpConnection(createMCPClient({
      transport: { type: "sse", url: "https://mcp.test/sse", fetch },
    }), {
      serverName: "fixture", abortSignal: owner.signal,
      onAbandon: () => connection.abort(),
    }), /origin/i);
    assert.equal(requestSignal?.aborted, true);
    assert.equal(streamStopped, true);
    assert.equal(owner.signal.aborted, false);
  } finally {
    await owner.dispose();
  }
});

test("connection timeout aborts the pending transport before any client is available", async () => {
  const transport = new AbortController();
  let active = true;
  const pending = new Promise<{ close: () => Promise<void> }>((_resolve, reject) => {
    transport.signal.addEventListener("abort", () => { active = false; reject(transport.signal.reason); }, { once: true });
  });
  await assert.rejects(awaitMcpConnection(pending, {
    serverName: "fixture", timeoutMs: 1, onAbandon: () => transport.abort(),
  }), /timed out/);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(active, false);
});

test("late clients use the same bounded owner even when close never settles", async () => {
  const owner = createMcpClientOwner({ closeTimeoutMs: 5 });
  let connect!: (client: { close: () => Promise<void> }) => void;
  const pending = new Promise<{ close: () => Promise<void> }>((resolve) => { connect = resolve; });
  const parent = new AbortController();
  const result = awaitMcpConnection(pending, {
    serverName: "fixture", abortSignal: parent.signal,
    closeLateClient: async (client) => { await (await owner.register(client))(); },
  });
  parent.abort();
  await assert.rejects(result, { name: "AbortError" });
  let closeCalls = 0;
  connect({ close: () => { closeCalls += 1; return new Promise<void>(() => {}); } });
  await new Promise<void>((resolve) => setImmediate(resolve));
  await owner.dispose();
  assert.equal(closeCalls, 1);
});
