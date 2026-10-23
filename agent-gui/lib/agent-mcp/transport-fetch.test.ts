import assert from "node:assert/strict";
import test from "node:test";
import { createMCPClient } from "@ai-sdk/mcp";
import { createMcpTransportFetch } from "./transport-fetch";
import { createMcpClientOwner } from "./client-owner";

function abortingFetch(observe: (signal: AbortSignal) => void): typeof globalThis.fetch {
  return async (_input, init) => {
    const signal = init!.signal!;
    observe(signal);
    signal.throwIfAborted();
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  };
}

test("stalled MCP DELETE aborts its actual HTTP request at the close deadline", async () => {
  const parent = new AbortController();
  let requestSignal: AbortSignal | undefined;
  const fetch = createMcpTransportFetch({
    abortSignal: parent.signal, closeTimeoutMs: 5,
    fetch: abortingFetch((signal) => { requestSignal = signal; }),
  });
  await assert.rejects(fetch("https://mcp.test/session", { method: "DELETE" }), { name: "TimeoutError" });
  assert.equal(requestSignal?.aborted, true);
});

test("turn cancellation aborts live HTTP/SSE requests while deletion gets its own deadline", async () => {
  const parent = new AbortController();
  const requests: AbortSignal[] = [];
  const fetch = createMcpTransportFetch({
    abortSignal: parent.signal, closeTimeoutMs: 5,
    fetch: abortingFetch((signal) => { requests.push(signal); }),
  });
  const get = fetch("https://mcp.test/session", { method: "GET" });
  const reason = new DOMException("turn cancelled", "AbortError");
  parent.abort(reason);
  await assert.rejects(get, (error) => error === reason);
  await assert.rejects(fetch("https://mcp.test/session", { method: "DELETE" }), { name: "TimeoutError" });
  assert.equal(requests.length, 2);
  assert.ok(requests.every((signal) => signal.aborted));
});

test("DELETE releases its response stream when headers arrive before the body ends", async () => {
  const parent = new AbortController();
  let requestSignal: AbortSignal | undefined;
  const fetch = createMcpTransportFetch({
    abortSignal: parent.signal,
    fetch: async (_input, init) => {
      requestSignal = init!.signal!;
      return new Response(new ReadableStream());
    },
  });
  await fetch("https://mcp.test/session", { method: "DELETE" });
  assert.equal(requestSignal?.aborted, true);
});

test("normal requests preserve SDK cancellation and never start after parent abort", async () => {
  const parent = new AbortController();
  const sdk = new AbortController();
  let calls = 0;
  const fetch = createMcpTransportFetch({
    abortSignal: parent.signal,
    fetch: abortingFetch(() => { calls += 1; }),
  });
  const pending = fetch("https://mcp.test/session", { method: "POST", signal: sdk.signal });
  const reason = new Error("SDK closed transport");
  sdk.abort(reason);
  await assert.rejects(pending, (error) => error === reason);
  parent.abort();
  await assert.rejects(fetch("https://mcp.test/session"), { name: "AbortError" });
  assert.equal(calls, 1);
});

test("the real SDK closes its HTTP transport when session DELETE never responds", async () => {
  const owner = createMcpClientOwner({ closeTimeoutMs: 100 });
  let deletionSignal: AbortSignal | undefined;
  let deletionStarted!: () => void;
  const deleting = new Promise<void>((resolve) => { deletionStarted = resolve; });
  const fetch = createMcpTransportFetch({
    abortSignal: owner.signal, closeTimeoutMs: 5,
    fetch: async (_input, init) => {
      if (init?.method === "GET") return new Response(null, { status: 405 });
      if (init?.method === "DELETE") {
        deletionSignal = init.signal!;
        deletionStarted();
        return new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
        });
      }
      const message = JSON.parse(String(init?.body)) as { id?: number; method: string };
      if (message.method === "notifications/initialized") return new Response(null, { status: 202 });
      assert.equal(message.method, "initialize");
      return Response.json({
        jsonrpc: "2.0", id: message.id,
        result: { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "fixture", version: "1" } },
      }, { headers: { "mcp-session-id": "fixture-only" } });
    },
  });
  const client = await createMCPClient({ transport: { type: "http", url: "https://mcp.test/session", fetch } });
  await owner.register(client);
  let otherClosed = false;
  await owner.register({ close: async () => { otherClosed = true; } });
  const closing = owner.dispose();
  await deleting;
  assert.equal(otherClosed, true);
  await closing;
  assert.equal(deletionSignal?.aborted, true);
  // SDK close completed its onClose path, so another close does not send a request.
  await client.close();
});
