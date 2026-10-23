import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { AgentNodeHttpStopTimeoutError, startAgentNodeHttpService } from "./node-http";

function within<T>(promise: Promise<T>, milliseconds = 1500): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Fixture timed out")), milliseconds);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

// Run separately from the no-network suite: every connection targets this test's ephemeral listener.
test("owned loopback HTTP/SSE listener propagates disconnect and stops an ignoring handler", async () => {
  let disconnected!: () => void;
  const aborted = new Promise<void>((resolve) => { disconnected = resolve; });
  let canceled!: () => void;
  const bodyCanceled = new Promise<void>((resolve) => { canceled = resolve; });
  let hanging!: () => void;
  const handlerStarted = new Promise<void>((resolve) => { hanging = resolve; });
  let hangingSignal: AbortSignal | undefined;
  let finishHanging!: (response: Response) => void;
  let stopTimedOut = false;
  let reentrantStop: Promise<void> | undefined;
  let otherSignal: AbortSignal | undefined;
  let otherBody!: ReadableStreamDefaultController<Uint8Array>;
  const service = await startAgentNodeHttpService(async (request) => {
    if (new URL(request.url).pathname === "/echo") {
      return new Response(await request.text(), { status: 201, headers: { "x-fixture": "owned" } });
    }
    if (new URL(request.url).pathname === "/hang") {
      hangingSignal = request.signal;
      request.signal.addEventListener("abort", () => { reentrantStop = service.stop(); }, { once: true });
      hanging();
      return new Promise<Response>((resolve) => { finishHanging = resolve; });
    }
    if (new URL(request.url).pathname === "/other") {
      otherSignal = request.signal;
      return new Response(new ReadableStream({
        start(controller) { otherBody = controller; controller.enqueue(new TextEncoder().encode("other:first\n")); },
      }));
    }
    request.signal.addEventListener("abort", disconnected, { once: true });
    return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode("data: fixture\n\n")); },
      cancel() { canceled(); },
    }), { headers: { "content-type": "text/event-stream" } });
  }, { stopGraceMs: 50 });
  const clients: http.ClientRequest[] = [];
  try {
    assert.equal(service.address.address, "127.0.0.1");
    assert.ok(service.address.port > 0);
    const echoed = await within(new Promise<string>((resolve, reject) => {
      const client = http.request(`${service.origin}/echo`, { method: "POST", agent: false }, (response) => {
        assert.equal(response.statusCode, 201);
        assert.equal(response.headers["x-fixture"], "owned");
        let data = "";
        response.on("data", (chunk) => { data += chunk; });
        response.on("end", () => resolve(data));
      });
      clients.push(client);
      client.on("error", reject);
      client.end("fixture body");
    }));
    assert.equal(echoed, "fixture body");
    let receivedOther!: (value: string) => void;
    const secondChunk = new Promise<string>((resolve) => { receivedOther = resolve; });
    let chunks = 0;
    await within(new Promise<void>((resolve, reject) => {
      const client = http.get(`${service.origin}/other`, { agent: false }, (response) => {
        response.on("data", (chunk) => { if (++chunks === 1) resolve(); else receivedOther(chunk.toString()); });
      });
      clients.push(client);
      client.on("error", reject);
    }));
    await within(new Promise<void>((resolve, reject) => {
      const client = http.get(`${service.origin}/sse`, { agent: false }, (response) => {
        response.once("data", (chunk) => {
          assert.equal(chunk.toString(), "data: fixture\n\n");
          client.destroy();
          resolve();
        });
      });
      clients.push(client);
      client.on("error", reject);
    }));
    await within(Promise.all([aborted, bodyCanceled]));
    assert.equal(otherSignal?.aborted, false);
    otherBody.enqueue(new TextEncoder().encode("other:still-alive\n"));
    assert.equal(await within(secondChunk), "other:still-alive\n");
    otherBody.close();
    const client = http.get(`${service.origin}/hang`, { agent: false });
    clients.push(client);
    client.on("error", () => {});
    await within(handlerStarted);
    const stopping = service.stop();
    assert.equal(service.stop(), stopping);
    assert.equal(reentrantStop, stopping);
    await assert.rejects(within(stopping), (error) => {
      assert.ok(error instanceof AgentNodeHttpStopTimeoutError);
      assert.equal(error.pendingRequests, 1);
      stopTimedOut = true;
      return true;
    });
    assert.equal(hangingSignal?.aborted, true);
    finishHanging(new Response());
    await within(service.whenSettled());
  } finally {
    for (const client of clients) client.destroy();
    if (stopTimedOut) await assert.rejects(service.stop(), AgentNodeHttpStopTimeoutError);
    else await within(service.stop());
  }
});
