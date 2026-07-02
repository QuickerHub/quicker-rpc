import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
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
}): string {
  return `${JSON.stringify({
    id: options.id,
    pageId: `page-${options.id}`,
    url: options.url,
    title: options.title,
    sourceType: "manual",
    sectionPath: [options.title],
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
});
