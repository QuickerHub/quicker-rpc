import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile, stat, unlink, utimes, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, it } from "node:test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  children: [],
  paths: [],
};

const originalChunksPath = process.env.QUICKER_KNOWLEDGE_CHUNKS_PATH;
const tempDirs: string[] = [];

afterEach(() => {
  if (originalChunksPath === undefined) {
    delete process.env.QUICKER_KNOWLEDGE_CHUNKS_PATH;
  } else {
    process.env.QUICKER_KNOWLEDGE_CHUNKS_PATH = originalChunksPath;
  }

  for (const dir of tempDirs.splice(0)) {
    assert.ok(resolve(dir).startsWith(`${resolve(tmpdir())}${sep}`));
    assert.ok(basename(dir).startsWith("quicker-knowledge-tool-"));
    rmSync(dir, { recursive: true, force: true });
  }
});

async function executeSearch(input: {
  query: string;
  limit?: number;
  sourceType?: "manual" | "action_dev" | "kb";
}): Promise<Record<string, unknown>> {
  const { executeQuickerKnowledgeSearchTool } = await import(
    "@/lib/quicker-knowledge-tool.server"
  );
  return executeQuickerKnowledgeSearchTool(input);
}

function makeTempChunksPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "quicker-knowledge-tool-"));
  tempDirs.push(dir);
  return join(dir, "chunks.jsonl");
}

function chunkJsonl(options: {
  id: string;
  url: string;
  title: string;
  text: string;
  contentHash: string;
  fetchedAt?: string | null;
  sectionPath?: string[];
}): string {
  return `${JSON.stringify({
    id: options.id,
    pageId: `page-${options.id}`,
    url: options.url,
    title: options.title,
    sourceType: "manual",
    sectionPath: options.sectionPath ?? [options.title],
    fetchedAt: options.fetchedAt,
    text: options.text,
    tokenEstimate: Math.ceil(options.text.length / 3),
    contentHash: options.contentHash,
  })}\n`;
}

function dataRecord(result: Record<string, unknown>): Record<string, unknown> {
  assert.equal(typeof result.data, "object");
  assert.notEqual(result.data, null);
  assert.equal(Array.isArray(result.data), false);
  return result.data as Record<string, unknown>;
}

function resultItems(result: Record<string, unknown>): Record<string, unknown>[] {
  const data = dataRecord(result);
  assert.ok(Array.isArray(data.results));
  return data.results as Record<string, unknown>[];
}

function knowledge(result: Record<string, unknown>) {
  return dataRecord(result).knowledge as {
    schemaVersion: number;
    source: Record<string, unknown>;
    schema: { format: string; revision: string };
    retrievedAt: string | null;
  };
}

describe("quicker knowledge tool", () => {
  it("returns input error for empty query", async () => {
    const result = await executeSearch({ query: " " });
    assert.equal(result.ok, false);
    assert.match(String(result.error), /query is required/);
  });

  it("returns setup error when corpus is missing", async () => {
    process.env.QUICKER_KNOWLEDGE_CHUNKS_PATH = join(
      makeTempChunksPath(),
      "missing",
      "chunks.jsonl",
    );

    const result = await executeSearch({ query: "动作面板" });

    assert.equal(result.ok, false);
    assert.match(String(result.error), /corpus.*missing/i);
    assert.match(String(dataRecord(result).hint), /corpus.*not available/i);
  });

  it("returns matching chunk metadata for successful search", async () => {
    const chunksPath = makeTempChunksPath();
    process.env.QUICKER_KNOWLEDGE_CHUNKS_PATH = chunksPath;
    await writeFile(
      chunksPath,
      chunkJsonl({
        id: "chunk-action-panel",
        url: "https://getquicker.net/manual/action-panel",
        title: "动作面板",
        text: "动作面板 可以管理和启动常用动作。",
        contentHash: "hash-action-panel",
      }),
      "utf8",
    );

    const result = await executeSearch({ query: "动作面板", limit: 1 });

    assert.equal(result.ok, true);
    assert.equal(dataRecord(result).success, true);
    const [item] = resultItems(result);
    assert.equal(item?.chunkId, "chunk-action-panel");
    assert.equal(item?.url, "https://getquicker.net/manual/action-panel");
    assert.equal(item?.fetchedAt, null);
    const provenance = knowledge(result);
    assert.deepEqual(provenance.source, { provider: "quicker.website-corpus", kind: "local-corpus" });
    assert.equal(provenance.schemaVersion, 1);
    assert.equal(provenance.schema.format, "quicker-knowledge.chunks.jsonl.v1");
    assert.equal(provenance.schema.revision, `sha256:${createHash("sha256").update(await readFile(chunksPath)).digest("hex")}`);
    assert.ok(provenance.retrievedAt && Number.isFinite(Date.parse(provenance.retrievedAt)));
  });

  it("refreshes cache when corpus content changes with same chunk count", async () => {
    const chunksPath = makeTempChunksPath();
    process.env.QUICKER_KNOWLEDGE_CHUNKS_PATH = chunksPath;
    await writeFile(
      chunksPath,
      chunkJsonl({
        id: "chunk-alpha",
        url: "https://getquicker.net/manual/alpha",
        title: "Alpha",
        text: "alpha only content",
        contentHash: "hash-alpha",
      }),
      "utf8",
    );

    const alpha = await executeSearch({ query: "alpha", limit: 1 });
    assert.equal(resultItems(alpha)[0]?.chunkId, "chunk-alpha");

    await writeFile(
      chunksPath,
      chunkJsonl({
        id: "chunk-beta",
        url: "https://getquicker.net/manual/beta",
        title: "Beta",
        text: "beta only content",
        contentHash: "hash-beta",
      }),
      "utf8",
    );

    const beta = await executeSearch({ query: "beta", limit: 1 });

    assert.equal(resultItems(beta)[0]?.chunkId, "chunk-beta");
    assert.equal(resultItems(beta)[0]?.url, "https://getquicker.net/manual/beta");
  });

  it("uses actual bytes when citation metadata changes at the same size and mtime", async () => {
    const path = makeTempChunksPath();
    process.env.QUICKER_KNOWLEDGE_CHUNKS_PATH = path;
    const fixed = new Date("2020-01-01T00:00:00.000Z");
    const old = chunkJsonl({ id: "same", url: "https://getquicker.net/manual/one", title: "Alpha", text: "shared content", contentHash: "same-hash", fetchedAt: "2026-10-20T00:00:00.000Z", sectionPath: ["part-a"] });
    const next = chunkJsonl({ id: "same", url: "https://getquicker.net/manual/two", title: "Bravo", text: "shared content", contentHash: "same-hash", fetchedAt: "2026-10-21T00:00:00.000Z", sectionPath: ["part-b"] });
    assert.equal(Buffer.byteLength(old), Buffer.byteLength(next));
    await writeFile(path, old); await utimes(path, fixed, fixed);
    const first = await executeSearch({ query: "content" });
    const before = await stat(path);
    await writeFile(path, next); await utimes(path, fixed, fixed);
    const updated = await executeSearch({ query: "content" });
    const after = await stat(path);
    assert.equal(after.size, before.size); assert.equal(after.mtimeMs, before.mtimeMs);
    const [cite] = resultItems(updated);
    assert.equal(cite?.url, "https://getquicker.net/manual/two");
    assert.equal(cite?.title, "Bravo");
    assert.deepEqual(cite?.sectionPath, ["part-b"]);
    assert.equal(cite?.fetchedAt, "2026-10-21T00:00:00.000Z");
    assert.notDeepEqual(dataRecord(first).knowledge, dataRecord(updated).knowledge);
  });

  it("does not trust a stored contentHash when same-size text changes", async () => {
    const path = makeTempChunksPath();
    process.env.QUICKER_KNOWLEDGE_CHUNKS_PATH = path;
    const fixed = new Date("2020-01-01T00:00:00.000Z");
    const make = (text: string) => chunkJsonl({ id: "same", url: "https://getquicker.net/manual/text", title: "Guide", text, contentHash: "untrusted" });
    const first = make("alpha target content"); const next = make("bravo target content");
    assert.equal(Buffer.byteLength(first), Buffer.byteLength(next));
    await writeFile(path, first); await utimes(path, fixed, fixed);
    await executeSearch({ query: "alpha" });
    await writeFile(path, next); await utimes(path, fixed, fixed);
    const result = await executeSearch({ query: "bravo" });
    assert.equal(resultItems(result)[0]?.chunkId, "same");
    assert.match(String(resultItems(result)[0]?.snippet), /bravo/);
  });

  it("missing after a successful search returns unknown revision and never stale citations", async () => {
    const path = makeTempChunksPath(); process.env.QUICKER_KNOWLEDGE_CHUNKS_PATH = path;
    await writeFile(path, chunkJsonl({ id: "warm", url: "https://getquicker.net/manual/warm", title: "Warm", text: "warm content", contentHash: "declared" }));
    assert.equal((await executeSearch({ query: "warm" })).ok, true);
    await unlink(path);
    const missing = await executeSearch({ query: "warm" });
    assert.equal(missing.ok, false);
    assert.equal(knowledge(missing).schema.revision, "unknown");
    assert.equal(knowledge(missing).retrievedAt, null);
    assert.equal(dataRecord(missing).results, undefined);
  });

  it("reads only the local snapshot and keeps cached citation metadata owned by the index", async () => {
    const path = makeTempChunksPath(); process.env.QUICKER_KNOWLEDGE_CHUNKS_PATH = path;
    await writeFile(path, chunkJsonl({ id: "cite", url: "https://getquicker.net/manual/cite", title: "Cite", text: "citation content", contentHash: "declared", fetchedAt: "2026-10-20T00:00:00.000Z", sectionPath: ["original"] }));
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("The local provider must not access the network."); };
    try {
      const first = await executeSearch({ query: "citation" });
      (resultItems(first)[0]!.sectionPath as string[]).push("caller mutation");
      const again = await executeSearch({ query: "citation" });
      assert.deepEqual(resultItems(again)[0]?.sectionPath, ["original"]);
      assert.equal(resultItems(again)[0]?.fetchedAt, "2026-10-20T00:00:00.000Z");
      assert.equal(knowledge(again).schema.revision, knowledge(first).schema.revision);
      assert.match(String(dataRecord(again).hint), /Cite result URLs/);
    } finally { globalThis.fetch = previousFetch; }
  });
});
