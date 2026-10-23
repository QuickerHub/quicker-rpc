import assert from "node:assert/strict";
import test from "node:test";
import { saveProgramDocumentClient } from "./program-document-save-client";
import { readWorkspaceFileReadCache, seedWorkspaceFileReadCache } from "./workspace-file-read-cache";
import type { ProgramDocumentSaveResult } from "./program-document-save";

const cwd = "fixture-workspace";
const path = ".quicker/actions/fixture/data.json";
const infoPath = ".quicker/actions/fixture/info.json";
const request = { path, content: "next body", expectedContent: "before body", metadata: { content: "next metadata", expectedContent: "before metadata" } };

async function fakeFetch(result: unknown, run: (calls: Array<{ input: RequestInfo | URL; init?: RequestInit }>) => Promise<void>) {
  const original = globalThis.fetch;
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => { calls.push({ input, init }); return Response.json(result); };
  try { await run(calls); }
  finally { globalThis.fetch = original; }
}

test("client posts the document ticket, cwd and signal, invalidating both file cache entries", async () => {
  seedWorkspaceFileReadCache(cwd, path, "stale body");
  seedWorkspaceFileReadCache(cwd, infoPath, "stale metadata");
  seedWorkspaceFileReadCache(cwd, ".quicker/actions/other/data.json", "other");
  const abort = new AbortController();
  await fakeFetch({ ok: true }, async (calls) => {
    assert.deepEqual(await saveProgramDocumentClient(cwd, request, { abortSignal: abort.signal }), { ok: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.input, "/api/workspace");
    assert.equal(calls[0]!.init!.method, "POST");
    assert.equal(calls[0]!.init!.signal, abort.signal);
    assert.deepEqual(JSON.parse(calls[0]!.init!.body as string), { ...request, cwd, op: "save-program-document" });
  });
  assert.equal(readWorkspaceFileReadCache(cwd, path), undefined);
  assert.equal(readWorkspaceFileReadCache(cwd, infoPath), undefined);
  assert.equal(readWorkspaceFileReadCache(cwd, ".quicker/actions/other/data.json")?.content, "other");
});

test("known partial persistence invalidates both entries, while an initial conflict retains them", async () => {
  const partial: ProgramDocumentSaveResult = { ok: false, error: "fixture partial", code: "write_failed", persistedParts: { body: true } };
  seedWorkspaceFileReadCache(cwd, path, "stale body");
  seedWorkspaceFileReadCache(cwd, infoPath, "stale metadata");
  await fakeFetch(partial, async () => assert.deepEqual(await saveProgramDocumentClient(cwd, request), partial));
  assert.equal(readWorkspaceFileReadCache(cwd, path), undefined);
  assert.equal(readWorkspaceFileReadCache(cwd, infoPath), undefined);
  const conflict: ProgramDocumentSaveResult = { ok: false, error: "changed", code: "metadata_conflict" };
  seedWorkspaceFileReadCache(cwd, path, "baseline body");
  seedWorkspaceFileReadCache(cwd, infoPath, "baseline metadata");
  await fakeFetch(conflict, async () => assert.deepEqual(await saveProgramDocumentClient(cwd, request), conflict));
  assert.equal(readWorkspaceFileReadCache(cwd, path)?.content, "baseline body");
  assert.equal(readWorkspaceFileReadCache(cwd, infoPath)?.content, "baseline metadata");
});

test("cancelled requests start no fetch and malformed responses are structured errors", async () => {
  const abort = new AbortController();
  abort.abort(new Error("fixture abort"));
  await fakeFetch({ ok: true }, async (calls) => {
    const result = await saveProgramDocumentClient(cwd, request, { abortSignal: abort.signal });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "aborted");
    assert.equal(calls.length, 0);
  });
  await fakeFetch(null, async () => {
    const result = await saveProgramDocumentClient(cwd, request);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "invalid_response");
  });
});
