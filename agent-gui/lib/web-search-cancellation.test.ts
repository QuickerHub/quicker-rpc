import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { createWebSearchRunner, type WebSearchProvider } from "./web-search.server";
import { createWebSearchToolExecutor } from "./web-search-tool.server";
import { runWithAgentRequestContextAsync } from "./qkrpc-request-context";

const providers: WebSearchProvider[] = ["duckduckgo", "brave", "tavily"];

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function payload(provider: WebSearchProvider): string {
  if (provider === "duckduckgo") {
    return '<a class="result__a" href="https://fixture.invalid/result">Fixture title</a>'
      + '<a class="result__snippet">Fixture snippet</a>';
  }
  if (provider === "brave") {
    return JSON.stringify({ web: { results: [{ title: "Fixture title", url: "https://fixture.invalid/result", description: "Fixture snippet" }] } });
  }
  return JSON.stringify({ results: [{ title: "Fixture title", url: "https://fixture.invalid/result", content: "Fixture snippet" }] });
}

function response(provider: WebSearchProvider): Response {
  return new Response(payload(provider), {
    headers: { "Content-Type": provider === "duckduckgo" ? "text/html" : "application/json" },
  });
}

function runner(provider: WebSearchProvider, fetch: typeof globalThis.fetch, timeoutMs = 1_000) {
  return createWebSearchRunner({
    fetch,
    readEnv: () => ({ WEB_SEARCH_PROVIDER: provider, BRAVE_SEARCH_API_KEY: "fixture-brave", TAVILY_API_KEY: "fixture-tavily" }),
    timeoutMs,
  });
}

function requireSignal(init?: RequestInit): AbortSignal {
  assert.ok(init?.signal);
  return init.signal;
}

function abortFailure(signal: AbortSignal, message = "synthetic fetch failure"): Promise<never> {
  signal.throwIfAborted();
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error(message)), { once: true });
  });
}

for (const provider of providers) {
  test(`${provider}: successful calls preserve provider parsing and the existing arguments`, async () => {
    let requests = 0;
    const run = runner(provider, async (_url, init) => {
      requests += 1;
      assert.equal(requireSignal(init).aborted, false);
      return response(provider);
    });
    const result = await run("  fixture query  ", 2);
    assert.equal(result.provider, provider);
    assert.equal(result.query, "fixture query");
    assert.deepEqual(result.results, [{ title: "Fixture title", url: "https://fixture.invalid/result", snippet: "Fixture snippet" }]);
    assert.equal(requests, 1);
  });

  test(`${provider}: pre-cancelled calls read no configuration and send no request`, async () => {
    let reads = 0;
    let requests = 0;
    const run = createWebSearchRunner({
      fetch: async () => { requests += 1; throw new Error("Unexpected fetch"); },
      readEnv: () => { reads += 1; return { WEB_SEARCH_PROVIDER: provider }; },
    });
    const execute = createWebSearchToolExecutor(run);
    const controller = new AbortController();
    const reason = new Error("turn cancelled before search");
    controller.abort(reason);
    await runWithAgentRequestContextAsync({ abortSignal: controller.signal }, async () => {
      await Promise.resolve();
      await assert.rejects(() => run("fixture"), (error) => error === reason);
      await assert.rejects(() => execute({ query: "fixture" }, { abortSignal: new AbortController().signal }), (error) => error === reason);
    });
    await assert.rejects(() => run("fixture", 2, provider, { abortSignal: controller.signal }), (error) => error === reason);
    assert.equal(reads, 0);
    assert.equal(requests, 0);
  });

  test(`${provider}: a running tool preserves parent cancellation and never starts another provider`, async () => {
    const started = deferred();
    const controller = new AbortController();
    const explicit = new AbortController();
    const reason = new Error("cancel running search");
    let requests = 0;
    const execute = createWebSearchToolExecutor(runner(provider, async (_url, init) => {
      requests += 1;
      const signal = requireSignal(init);
      started.resolve();
      return abortFailure(signal);
    }));
    const pending = runWithAgentRequestContextAsync({ abortSignal: controller.signal }, () => execute({ query: "fixture" }, { abortSignal: explicit.signal }));
    const rejected = assert.rejects(pending, (error) => error === reason);
    await started.promise;
    controller.abort(reason);
    await rejected;
    assert.equal(explicit.signal.aborted, false);
    assert.equal(requests, 1);
  });

  test(`${provider}: cancellation while consuming the response body remains cancellation`, async () => {
    const reading = deferred();
    const controller = new AbortController();
    const reason = new Error("cancel response body");
    let observedAborts = 0;
    let requests = 0;
    const run = runner(provider, async (_url, init) => {
      requests += 1;
      const signal = requireSignal(init);
      let result!: Response;
      const body = new ReadableStream<Uint8Array>({
        start(stream) {
          signal.addEventListener("abort", () => {
            observedAborts += 1;
            assert.equal(result.bodyUsed, true);
            stream.error(new Error("synthetic body read failure"));
          }, { once: true });
        },
        pull() { if (result?.bodyUsed) reading.resolve(); },
      });
      result = new Response(body);
      return result;
    });
    const pending = runWithAgentRequestContextAsync({ abortSignal: controller.signal }, () => run("fixture"));
    const rejected = assert.rejects(pending, (error) => error === reason);
    await reading.promise;
    controller.abort(reason);
    await rejected;
    assert.equal(requests, 1);
    assert.equal(observedAborts, 1);
  });

  test(`${provider}: a transport that returns after cancellation cannot expose a late success`, async () => {
    const started = deferred();
    const released = deferred<Response>();
    const controller = new AbortController();
    const reason = new Error("cancel before late response");
    let bodyReads = 0;
    const late = response(provider);
    const method = provider === "duckduckgo" ? "text" : "json";
    Object.defineProperty(late, method, { value: async () => { bodyReads += 1; throw new Error("Body must not be read"); } });
    const execute = createWebSearchToolExecutor(runner(provider, async () => {
      started.resolve();
      return released.promise;
    }));
    const pending = execute({ query: "fixture" }, { abortSignal: controller.signal });
    const rejected = assert.rejects(pending, (error) => error === reason);
    await started.promise;
    controller.abort(reason);
    released.resolve(late);
    await rejected;
    assert.equal(bodyReads, 0);
  });

  test(`${provider}: an ignored body abort cannot become a successful tool result`, async () => {
    const reading = deferred();
    const released = deferred();
    const controller = new AbortController();
    const reason = new Error("cancel before late body");
    const late = response(provider);
    const method = provider === "duckduckgo" ? "text" : "json";
    Object.defineProperty(late, method, { value: async () => {
      reading.resolve();
      await released.promise;
      return provider === "duckduckgo" ? payload(provider) : JSON.parse(payload(provider));
    } });
    const execute = createWebSearchToolExecutor(runner(provider, async () => late));
    const pending = execute({ query: "fixture" }, { abortSignal: controller.signal });
    const rejected = assert.rejects(pending, (error) => error === reason);
    await reading.promise;
    controller.abort(reason);
    released.resolve();
    await rejected;
  });
}

test("a search queued before turn cancellation performs no configuration read or fetch", async () => {
  const controller = new AbortController();
  const reason = new Error("cancel queued search");
  let reads = 0;
  let requests = 0;
  const run = createWebSearchRunner({
    fetch: async () => { requests += 1; throw new Error("Unexpected fetch"); },
    readEnv: () => { reads += 1; return { WEB_SEARCH_PROVIDER: "duckduckgo" }; },
  });
  await runWithAgentRequestContextAsync({ abortSignal: controller.signal }, async () => {
    const pending = Promise.resolve().then(() => run("fixture"));
    controller.abort(reason);
    await assert.rejects(pending, (error) => error === reason);
  });
  assert.equal(reads, 0);
  assert.equal(requests, 0);
});

test("the existing explicit DuckDuckGo override needs no key configuration", async () => {
  const run = createWebSearchRunner({
    readEnv: () => { throw new Error("Explicit DuckDuckGo must not load key configuration"); },
    fetch: async () => response("duckduckgo"),
  });
  assert.equal((await run("fixture", 2, "duckduckgo")).provider, "duckduckgo");
});

test("an explicit child cancellation interrupts fetch without cancelling the owning turn", async () => {
  const parent = new AbortController();
  const explicit = new AbortController();
  const reason = new Error("cancel child search");
  const started = deferred();
  const execute = createWebSearchToolExecutor(runner("brave", async (_url, init) => {
    started.resolve();
    return abortFailure(requireSignal(init));
  }));
  const pending = runWithAgentRequestContextAsync({ abortSignal: parent.signal }, () => execute({ query: "fixture" }, { abortSignal: explicit.signal }));
  const rejected = assert.rejects(pending, (error) => error === reason);
  await started.promise;
  explicit.abort(reason);
  await rejected;
  assert.equal(parent.signal.aborted, false);
});

test("concurrent turns sharing a thread id do not cancel one another", async () => {
  const first = new AbortController();
  const second = new AbortController();
  const reason = new Error("cancel first turn only");
  const started = deferred();
  const releaseSecond = deferred<Response>();
  const signals: AbortSignal[] = [];
  const run = runner("tavily", async (_url, init) => {
    const signal = requireSignal(init);
    signals.push(signal);
    if (signals.length === 2) { started.resolve(); return releaseSecond.promise; }
    return abortFailure(signal);
  });
  const firstPending = runWithAgentRequestContextAsync({ abortSignal: first.signal, threadId: "same-thread" }, () => run("first"));
  const firstRejected = assert.rejects(firstPending, (error) => error === reason);
  const secondPending = runWithAgentRequestContextAsync({ abortSignal: second.signal, threadId: "same-thread" }, () => run("second"));
  await started.promise;
  first.abort(reason);
  await firstRejected;
  assert.equal(signals[1].aborted, false);
  releaseSecond.resolve(response("tavily"));
  assert.equal((await secondPending).query, "second");
  assert.equal(second.signal.aborted, false);
});

test("provider timeout is distinct from parent cancellation and remains an ordinary tool failure", async () => {
  const parent = new AbortController();
  let requests = 0;
  const run = runner("duckduckgo", async (_url, init) => {
    requests += 1;
    return abortFailure(requireSignal(init));
  }, 5);
  await runWithAgentRequestContextAsync({ abortSignal: parent.signal }, async () => {
    await assert.rejects(() => run("fixture"), (error: unknown) => error instanceof DOMException && error.name === "TimeoutError");
    const result = await createWebSearchToolExecutor(run)({ query: "fixture" });
    assert.equal(result.ok, false);
    assert.match(String(result.stderr), /Web search timed out/);
  });
  assert.equal(parent.signal.aborted, false);
  assert.equal(requests, 2);
});

test("successful requests clear their owned deadline", async () => {
  let signal!: AbortSignal;
  const run = runner("brave", async (_url, init) => {
    signal = requireSignal(init);
    return response("brave");
  }, 5);
  await run("fixture");
  await delay(15);
  assert.equal(signal.aborted, false);
});

test("ordinary provider failures remain failed tool results without fallback", async () => {
  let requests = 0;
  const execute = createWebSearchToolExecutor(runner("brave", async () => {
    requests += 1;
    return new Response("fixture unavailable", { status: 503 });
  }));
  const result = await execute({ query: "fixture" });
  assert.equal(result.ok, false);
  assert.match(String(result.stderr), /Brave search failed: HTTP 503 fixture unavailable/);
  assert.equal(requests, 1);
});
