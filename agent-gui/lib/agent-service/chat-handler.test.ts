import assert from "node:assert/strict";
import { test } from "node:test";
import { createAgentChatHandler } from "./chat-handler";
import { isReleasePreviewActive } from "../release-preview-context";

function request(body: unknown = { messages: [] }, cookie?: string, signal?: AbortSignal) {
  return new Request("http://offline.test/api/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    signal,
  });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test("forwards approval payloads and request signal without reshaping the runner response or SSE", async () => {
  const body = {
    messages: [{ id: "approval-message", role: "assistant", parts: [{
      type: "tool-offline", toolCallId: "call-1", state: "approval-responded",
      input: { action: "write", value: 2 }, approval: { id: "approval-1", approved: true, reason: "continue" },
    }] }],
    enabledTools: [], workingDirectory: "/offline", threadId: "thread-1", chatMode: "agent",
  };
  const encoder = new TextEncoder();
  const chunks = ["data: {\"type\":\"start\"}\n\n", "data: [DONE]\n\n"];
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
    controller.close();
  } });
  const response = new Response(stream, { status: 202, headers: {
    "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1", "x-offline": "unchanged",
  } });
  const req = request(body);
  const handler = createAgentChatHandler({ runTurn: (actual, options) => {
    assert.deepEqual(actual, body);
    assert.equal(options.abortSignal, req.signal);
    return response;
  } });
  const result = await handler(req);
  assert.equal(result, response);
  assert.equal(result.body, stream);
  assert.equal(result.status, 202);
  assert.equal(result.headers.get("x-vercel-ai-ui-message-stream"), "v1");
  assert.equal(result.headers.get("x-offline"), "unchanged");
  assert.equal(await result.text(), chunks.join(""));
});

test("malformed JSON keeps the existing 500 error shape and never enters the runner", async () => {
  let calls = 0;
  let reported: unknown;
  const handler = createAgentChatHandler({
    runTurn: () => { calls++; return new Response(); },
    onError: (error) => { reported = error; },
  });
  const result = await handler(new Request("http://offline.test/api/chat", { method: "POST", body: "{" }));
  assert.equal(result.status, 500);
  assert.ok(reported instanceof SyntaxError);
  assert.deepEqual(await result.json(), { error: reported.message });
  assert.equal(calls, 0);
});

test("the runner retains JSON validation and response status ownership", async () => {
  const response = Response.json({ error: "messages are required" }, { status: 400 });
  const handler = createAgentChatHandler({ runTurn: (body) => {
    assert.equal(body, null);
    return response;
  } });
  assert.equal(await handler(request(null)), response);
});

test("runner errors preserve error messages and a failing reporter cannot replace them", async () => {
  for (const error of [new Error("offline runner failed"), "plain failure"]) {
    const handler = createAgentChatHandler({
      runTurn: () => { throw error; },
      onError: (reported) => { assert.equal(reported, error); throw new Error("reporting failed"); },
    });
    const result = await handler(request());
    assert.equal(result.status, 500);
    assert.deepEqual(await result.json(), { error: error instanceof Error ? error.message : error });
  }
});

test("already aborted requests return empty 499 without parsing or running", async () => {
  const controller = new AbortController();
  controller.abort(new Error("offline cancel"));
  let calls = 0;
  const handler = createAgentChatHandler({
    runTurn: () => { calls++; return new Response(); },
    onError: () => { throw new Error("cancellation is not reported as a server error"); },
  });
  const req = new Request("http://offline.test/api/chat", { method: "POST", body: "{", signal: controller.signal });
  const result = await handler(req);
  assert.equal(result.status, 499);
  assert.equal(await result.text(), "");
  assert.equal(calls, 0);
});

test("in-flight cancellation reaches the runner's exact request signal and returns 499", async () => {
  const controller = new AbortController();
  const entered = deferred();
  let reported = false;
  const req = request(undefined, undefined, controller.signal);
  const handler = createAgentChatHandler({
    runTurn: (_body, { abortSignal }) => {
      assert.equal(abortSignal, req.signal);
      entered.resolve();
      return new Promise<Response>((_resolve, reject) => {
        abortSignal.addEventListener("abort", () => reject(abortSignal.reason), { once: true });
      });
    },
    onError: () => { reported = true; },
  });
  const pending = handler(req);
  await entered.promise;
  controller.abort(new Error("cancel the offline runner"));
  const result = await pending;
  assert.equal(result.status, 499);
  assert.equal(await result.text(), "");
  assert.equal(reported, false);
});

test("release preview cookies use an exact name and decoded value 1", async () => {
  const cases: [string | undefined, boolean][] = [
    [undefined, false], ["qa-release-preview=1", true],
    ["other=1; qa-release-preview=1; next=x", true], ["qa-release-preview=%31", true],
    ["other=x;\tqa-release-preview=1", false],
    ["xqa-release-preview=1", false], ["qa-release-preview-extra=1", false],
    ["QA-release-preview=1", false], ["other=qa-release-preview=1", false],
    ['qa-release-preview="1"', false], ["qa-release-preview=true", false],
    ["qa-release-preview=10", false], ["qa-release-preview=1=0", false],
    ["qa-release-preview=%2531", false], ["qa-release-preview =1", false],
    ["qa-release-preview=1 ; other=x", false], ["qa-release-preview=1, other=0", false],
    ["qa-release-preview=1; qa-release-preview=0", false],
    ["qa-release-preview=0; qa-release-preview=1", true],
    ["qa-release-preview=%E0%A4%A", false],
    ["qa-release-preview=1; qa-release-preview=%E0%A4%A", true],
    ["qa-release-preview=1; qa-release-preview", false],
  ];
  for (const [cookie, expected] of cases) {
    const handler = createAgentChatHandler({ runTurn: () => {
      assert.equal(isReleasePreviewActive(), expected, cookie);
      return new Response();
    } });
    assert.equal((await handler(request(undefined, cookie))).status, 200);
    assert.equal(isReleasePreviewActive(), false);
  }
});

test("concurrent preview and normal requests keep their scope through await and failure", async () => {
  const entered = [deferred(), deferred()];
  const release = [deferred(), deferred()];
  const seen: [string, boolean][] = [];
  const handler = createAgentChatHandler({
    runTurn: async (body) => {
      const preview = body.threadId === "preview";
      const index = preview ? 0 : 1;
      seen.push([`${body.threadId}:start`, isReleasePreviewActive()]);
      entered[index].resolve();
      await release[index].promise;
      seen.push([`${body.threadId}:end`, isReleasePreviewActive()]);
      if (preview) throw new Error("preview failed");
      return new Response("normal response");
    },
    onError: () => { assert.equal(isReleasePreviewActive(), false); },
  });
  const preview = handler(request({ messages: [], threadId: "preview" }, "qa-release-preview=1"));
  const normal = handler(request({ messages: [], threadId: "normal" }));
  await Promise.all(entered.map((item) => item.promise));
  assert.equal(isReleasePreviewActive(), false);
  release[0].resolve();
  assert.equal((await preview).status, 500);
  release[1].resolve();
  assert.equal(await (await normal).text(), "normal response");
  assert.deepEqual(seen, [
    ["preview:start", true], ["normal:start", false], ["preview:end", true], ["normal:end", false],
  ]);
  assert.equal(isReleasePreviewActive(), false);
});
