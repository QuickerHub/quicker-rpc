import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { afterEach, describe, it } from "node:test";
import { createQuickerKnowledgeIndexLoader } from "@/lib/quicker-knowledge/index-provider.server";
import { buildQuickerKnowledgeKeywordIndex, searchQuickerKnowledge } from "@/lib/quicker-knowledge/search";
import { loadQuickerKnowledgeCorpusSnapshot } from "@/lib/quicker-knowledge/store.server";

const owned: string[] = [];
afterEach(async () => {
  for (const dir of owned.splice(0)) {
    assert.ok(resolve(dir).startsWith(`${resolve(tmpdir())}${sep}`));
    assert.ok(basename(dir).startsWith("quicker-knowledge-index-"));
    await rm(dir, { recursive: true, force: true });
  }
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "quicker-knowledge-index-"));
  owned.push(dir);
  return join(dir, "chunks.jsonl");
}
function content(marker: string) {
  return JSON.stringify({ id: "chunk", pageId: "page", sourceType: "manual", title: marker,
    url: `https://getquicker.net/manual/${marker}`, sectionPath: [marker], text: "shared content",
    contentHash: "untrusted", fetchedAt: marker === "old" ? "2026-10-20T00:00:00.000Z" : "2026-10-21T00:00:00.000Z" });
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("local corpus index owner", () => {
  it("checks real file bytes on every request before reusing the same index", async () => {
    const path = await fixture();
    await writeFile(path, content("old"));
    let reads = 0, builds = 0;
    const load = createQuickerKnowledgeIndexLoader({
      readSnapshot: async (file) => { reads++; return loadQuickerKnowledgeCorpusSnapshot(file); },
      buildIndex: (chunks) => { builds++; return buildQuickerKnowledgeKeywordIndex(chunks); },
    });
    const first = await load(path);
    const second = await load(path);
    assert.equal(first.index, second.index);
    assert.equal(first.revision, second.revision);
    assert.equal(reads, 2); assert.equal(builds, 1);
  });

  it("late older reads retain their own citations but cannot replace the newer cached snapshot", async () => {
    const path = await fixture();
    await writeFile(path, content("old"));
    const captured = deferred(), release = deferred();
    let reads = 0, builds = 0;
    const load = createQuickerKnowledgeIndexLoader({
      readSnapshot: async (file) => {
        const own = ++reads;
        const snapshot = await loadQuickerKnowledgeCorpusSnapshot(file);
        if (own === 1) { captured.resolve(); await release.promise; }
        return snapshot;
      },
      buildIndex: (chunks) => { builds++; return buildQuickerKnowledgeKeywordIndex(chunks); },
    });
    const pending = load(path);
    await captured.promise;
    await writeFile(path, content("new"));
    const newer = await load(path);
    release.resolve();
    const older = await pending;
    assert.notEqual(older.revision, newer.revision);
    const cite = (snapshot: typeof newer) => searchQuickerKnowledge(snapshot.index, { query: "shared" })[0]!;
    assert.equal(cite(older).url, "https://getquicker.net/manual/old");
    assert.equal(cite(older).fetchedAt, "2026-10-20T00:00:00.000Z");
    assert.equal(cite(newer).url, "https://getquicker.net/manual/new");
    assert.equal(cite(newer).fetchedAt, "2026-10-21T00:00:00.000Z");
    assert.equal((await load(path)).index, newer.index);
    assert.equal(builds, 2, "The old completion cannot force a new rebuild of the already current index.");
  });

  it("a newer missing-file result cannot be undone by an older successful read", async () => {
    const path = await fixture(); const original = content("old");
    await writeFile(path, original);
    const captured = deferred(), release = deferred();
    let reads = 0, builds = 0;
    const load = createQuickerKnowledgeIndexLoader({
      readSnapshot: async (file) => {
        const own = ++reads;
        const snapshot = await loadQuickerKnowledgeCorpusSnapshot(file);
        if (own === 2) { captured.resolve(); await release.promise; }
        return snapshot;
      },
      buildIndex: (chunks) => { builds++; return buildQuickerKnowledgeKeywordIndex(chunks); },
    });
    const first = await load(path);
    const pending = load(path); await captured.promise;
    await unlink(path);
    await assert.rejects(load(path), { code: "ENOENT" });
    release.resolve(); const older = await pending;
    assert.equal(older.revision, first.revision, "This independent read keeps its own already-read content.");
    await assert.rejects(load(path), { code: "ENOENT" });
    await writeFile(path, original);
    const restored = await load(path);
    assert.notEqual(restored.index, older.index);
    assert.notEqual(restored.index, first.index);
    assert.equal(builds, 3, "The primed, independent late, and recreated snapshots each build; late data cannot restore the cache.");
  });

  it("an older failure does not clear a newer successful index", async () => {
    const path = await fixture(); await writeFile(path, content("new"));
    const captured = deferred(), release = deferred();
    let reads = 0, builds = 0;
    const load = createQuickerKnowledgeIndexLoader({
      readSnapshot: async (file) => {
        if (++reads === 1) { captured.resolve(); await release.promise; throw new Error("old read failed"); }
        return loadQuickerKnowledgeCorpusSnapshot(file);
      },
      buildIndex: (chunks) => { builds++; return buildQuickerKnowledgeKeywordIndex(chunks); },
    });
    const pending = load(path); await captured.promise;
    const newer = await load(path);
    release.resolve(); await assert.rejects(pending, /old read failed/);
    assert.equal((await load(path)).index, newer.index);
    assert.equal(builds, 1);
  });

  it("different corpus paths are separate owners even when bytes match", async () => {
    const firstPath = await fixture(), secondPath = await fixture();
    await writeFile(firstPath, content("new"));
    await writeFile(secondPath, await readFile(firstPath));
    const load = createQuickerKnowledgeIndexLoader();
    const first = await load(firstPath), second = await load(secondPath);
    assert.equal(first.revision, second.revision);
    assert.notEqual(first.index, second.index);
  });
});
