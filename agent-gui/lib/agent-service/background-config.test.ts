import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";
import { configureAgentDataProfile } from "../agent-data-profile.mjs";
import { closeAgentDatabase } from "../db/client";
import { AppKvKey, readAppKvJson } from "../db/app-kv";
import { refreshRemotePublishConfig, stopRemotePublishConfigRefreshes } from "../llm-remote-publish-config";

test("background config refresh aborts and settles before storage closes, including a late ignoring fetch", async (t) => {
  const parent = resolve("../.tmp");
  mkdirSync(parent, { recursive: true });
  configureAgentDataProfile(mkdtempSync(join(parent, "background-config-")));
  let release!: (response: Response) => void;
  let signal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", async (_input, options) => {
    signal = options?.signal as AbortSignal;
    return new Promise<Response>((done) => { release = done; });
  });
  try {
    const pending = refreshRemotePublishConfig({ force: true });
    assert.ok(signal);
    let stopped = false;
    const stop = stopRemotePublishConfigRefreshes().then(() => { stopped = true; });
    assert.equal(signal.aborted, true);
    await Promise.resolve();
    assert.equal(stopped, false);
    release(Response.json({ version: 2, endpoints: [{ apiKey: "fixture-only", baseURL: "http://fixture.invalid", model: "fixture" }] }));
    assert.equal((await pending).ok, false);
    await stop;
    assert.equal(readAppKvJson(AppKvKey.llmRemotePublishConfig), null);
    closeAgentDatabase();
    assert.equal((await refreshRemotePublishConfig({ force: true })).ok, false);
  } finally { closeAgentDatabase(); }
});
