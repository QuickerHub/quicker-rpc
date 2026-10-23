import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { createAgentNodeHttpListener, startAgentNodeHttpService } from "./node-http";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const text = (value: string) => new TextEncoder().encode(value);

class FakeResponse extends EventEmitter {
  destroyed = false;
  writableFinished = false;
  headersSent = false;
  blocked = false;
  status = 0;
  headers: Record<string, string | string[]> = {};
  chunks: Uint8Array[] = [];
  writeHead(status: number, statusTextOrHeaders?: string | Record<string, string | string[]>, headers?: Record<string, string | string[]>) {
    this.status = status;
    this.headers = headers ?? (typeof statusTextOrHeaders === "object" ? statusTextOrHeaders : {});
    this.headersSent = true;
  }
  write(chunk: Uint8Array) { this.chunks.push(chunk); return !this.blocked; }
  flushHeaders() {}
  end(chunk?: string) {
    if (chunk) this.chunks.push(text(chunk));
    this.writableFinished = true;
    this.emit("finish");
  }
  destroy() { this.destroyed = true; this.emit("close"); }
}

function request(method = "GET", path = "/") {
  return Object.assign(new PassThrough(), {
    method, url: path, rawHeaders: ["host", "fixture.invalid", "x-fixture", "injected"],
    aborted: false, complete: true,
  }) as unknown as IncomingMessage;
}

function dispatch(handler: Parameters<typeof createAgentNodeHttpListener>[0], incoming = request(), lifetime?: AbortSignal) {
  const outgoing = new FakeResponse();
  createAgentNodeHttpListener(handler, { signal: lifetime })(incoming, outgoing as unknown as ServerResponse);
  return outgoing;
}

test("preserves HTTP status/headers/body and normal request close does not abort", async () => {
  let signal: AbortSignal | undefined;
  const incoming = request("POST", "/echo?fixture=1");
  const outgoing = dispatch(async (webRequest) => {
    signal = webRequest.signal;
    assert.equal(webRequest.url, "http://fixture.invalid/echo?fixture=1");
    assert.equal(webRequest.headers.get("x-fixture"), "injected");
    assert.equal(await webRequest.text(), "body");
    return new Response("accepted", { status: 202, headers: { "x-result": "kept", "set-cookie": "a=1" } });
  }, incoming);
  (incoming as unknown as PassThrough).end("body");
  await tick();
  assert.equal(outgoing.status, 202);
  assert.equal(outgoing.headers["x-result"], "kept");
  assert.deepEqual(outgoing.headers["set-cookie"], ["a=1"]);
  assert.equal(Buffer.concat(outgoing.chunks).toString(), "accepted");
  assert.equal(signal?.aborted, false);
  assert.equal(incoming.listenerCount("aborted"), 0);
});

test("SSE pumping waits for Node drain and releases its response reader", async () => {
  let pulled = 0;
  const response = new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled += 1;
      if (pulled <= 2) controller.enqueue(text(`data: ${pulled}\n\n`));
      else controller.close();
    },
  }, { highWaterMark: 0 }), { headers: { "content-type": "text/event-stream", "x-fixture": "sse" } });
  const outgoing = dispatch(async () => response);
  outgoing.blocked = true;
  await tick();
  assert.equal(pulled, 1);
  assert.equal(outgoing.chunks.length, 1);
  assert.equal(outgoing.listenerCount("drain"), 1);
  outgoing.blocked = false;
  outgoing.emit("drain");
  await tick();
  assert.equal(Buffer.concat(outgoing.chunks).toString(), "data: 1\n\ndata: 2\n\n");
  assert.equal(outgoing.writableFinished, true);
  assert.equal(response.body?.locked, false);
  assert.equal(outgoing.listenerCount("drain"), 0);
});

test("disconnect aborts before canceling the body, without canceling another request", async () => {
  const events: string[] = [];
  const signals: AbortSignal[] = [];
  const bodies: Response[] = [];
  const listener = createAgentNodeHttpListener(async (webRequest) => {
    const index = signals.push(webRequest.signal) - 1;
    webRequest.signal.addEventListener("abort", () => events.push(`abort:${index}`));
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(text("data: first\n\n")); },
      cancel() { events.push(`cancel:${index}`); },
    }));
    bodies.push(response);
    return response;
  });
  const first = new FakeResponse();
  const second = new FakeResponse();
  listener(request(), first as unknown as ServerResponse);
  listener(request(), second as unknown as ServerResponse);
  await tick();
  first.destroy();
  await tick();
  assert.deepEqual(events, ["abort:0", "cancel:0"]);
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
  assert.equal(bodies[0].body?.locked, false);
  second.destroy();
  await tick();
  assert.equal(bodies[1].body?.locked, false);
});

test("service abort releases backpressure and cancels a late response from an ignoring handler", async () => {
  const lifetime = new AbortController();
  let requestSignal: AbortSignal | undefined;
  let resolveHandler!: (response: Response) => void;
  let canceled = false;
  const outgoing = dispatch(async (webRequest) => {
    requestSignal = webRequest.signal;
    return new Promise<Response>((resolve) => { resolveHandler = resolve; });
  }, request(), lifetime.signal);
  const reason = new Error("fixture stop");
  lifetime.abort(reason);
  assert.equal(requestSignal?.aborted, true);
  assert.equal(requestSignal?.reason, reason);
  assert.equal(outgoing.destroyed, true);
  resolveHandler(new Response(new ReadableStream({ cancel() { canceled = true; } })));
  await tick();
  assert.equal(canceled, true);

  const nextLifetime = new AbortController();
  const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(text("blocked")); } }));
  const blocked = dispatch(async () => response, request(), nextLifetime.signal);
  blocked.blocked = true;
  await tick();
  nextLifetime.abort(reason);
  await tick();
  assert.equal(blocked.listenerCount("drain"), 0);
  assert.equal(response.body?.locked, false);
});

test("handler and stream failures abort work and release response ownership", async () => {
  let signal: AbortSignal | undefined;
  const outgoing = dispatch(async (webRequest) => { signal = webRequest.signal; throw new Error("private failure"); });
  await tick();
  assert.equal(outgoing.status, 500);
  assert.equal(Buffer.concat(outgoing.chunks).toString(), "Internal Server Error");
  assert.equal(signal?.aborted, true);

  const response = new Response(new ReadableStream({ pull(controller) { controller.error(new Error("stream failed")); } }));
  const broken = dispatch(async (webRequest) => { signal = webRequest.signal; return response; });
  await tick();
  assert.equal(broken.destroyed, true);
  assert.equal(signal?.aborted, true);
  assert.equal(response.body?.locked, false);
});

test("idle waits for cooperative asynchronous body cancellation before releasing its owner", async () => {
  const lifetime = new AbortController();
  let finishCancel!: () => void;
  const response = new Response(new ReadableStream({
    cancel() { return new Promise<void>((resolve) => { finishCancel = resolve; }); },
  }));
  const listener = createAgentNodeHttpListener(async () => response, { signal: lifetime.signal });
  listener(request(), new FakeResponse() as unknown as ServerResponse);
  await tick();
  lifetime.abort(new Error("fixture stop"));
  let settled = false;
  const idle = listener.waitForIdle().then(() => { settled = true; });
  await tick();
  assert.equal(listener.pendingBodyCancels, 1);
  assert.equal(settled, false);
  finishCancel();
  await idle;
  assert.equal(listener.pendingRequests, 0);
  assert.equal(listener.pendingBodyCancels, 0);
  assert.equal(response.body?.locked, false);
});

test("rejects remote hosts and invalid ports before allocating a listener", async () => {
  await assert.rejects(startAgentNodeHttpService(async () => new Response(), { host: "0.0.0.0" }), /loopback/);
  await assert.rejects(startAgentNodeHttpService(async () => new Response(), { port: -1 }), /port/);
});
