import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, it } from "node:test";

import { loadQuickerKnowledgeChunksFromJsonl, loadQuickerKnowledgeCorpusSnapshot } from "@/lib/quicker-knowledge/store.server";

const owned: string[] = [];
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "quicker-knowledge-store-"));
  owned.push(dir);
  return join(dir, "chunks.jsonl");
}
afterEach(async () => {
  for (const dir of owned.splice(0)) {
    assert.ok(resolve(dir).startsWith(`${resolve(tmpdir())}${sep}`));
    assert.ok(basename(dir).startsWith("quicker-knowledge-store-"));
    await rm(dir, { recursive: true, force: true });
  }
});

describe("quicker knowledge store", () => {
  it("loads valid chunk jsonl and skips blank lines", async () => {
    const file = await fixture();
    await writeFile(file, [
      JSON.stringify({
        id: "a",
        pageId: "p",
        url: "https://getquicker.net/KC",
        title: "Quicker",
        sectionPath: ["Quicker"],
        sourceType: "manual",
        text: "动作面板",
        tokenEstimate: 4,
        contentHash: "h",
      }),
      "",
    ].join("\n"), "utf8");

    const chunks = await loadQuickerKnowledgeChunksFromJsonl(file);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]!.title, "Quicker");
    assert.equal(chunks[0]!.fetchedAt, null);
  });

  it("rejects invalid source types with a line-numbered error", async () => {
    const file = await fixture();
    await writeFile(file, JSON.stringify({
      id: "a",
      pageId: "p",
      url: "https://getquicker.net/KC",
      title: "Quicker",
      sectionPath: ["Quicker"],
      sourceType: "manuals",
      text: "动作面板",
      tokenEstimate: 4,
      contentHash: "h",
    }), "utf8");

    await assert.rejects(
      loadQuickerKnowledgeChunksFromJsonl(file),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /line 1/);
        assert.match(error.message, /sourceType/);
        return true;
      },
    );
  });

  it("fingerprints all bytes and preserves the recorded page capture time", async () => {
    const file = await fixture();
    const base = { id: "a", pageId: "p", url: "https://getquicker.net/KC", title: "Page", sourceType: "manual", sectionPath: [], text: "same text", contentHash: "declared", fetchedAt: "2026-10-20T00:00:00.000Z" };
    const first = Buffer.from(`${JSON.stringify({ ...base, metadata: { revision: "a" } })}\n`);
    await writeFile(file, first);
    const snapshot = await loadQuickerKnowledgeCorpusSnapshot(file);
    assert.equal(snapshot.revision, `sha256:${createHash("sha256").update(first).digest("hex")}`);
    assert.equal(snapshot.chunks[0]?.fetchedAt, base.fetchedAt);
    assert.equal(snapshot.corpusPath, resolve(file));
    assert.ok(Number.isFinite(Date.parse(snapshot.retrievedAt)));
    await writeFile(file, `${JSON.stringify({ ...base, metadata: { revision: "b" } })}\n`);
    const changed = await loadQuickerKnowledgeCorpusSnapshot(file);
    assert.notEqual(snapshot.revision, changed.revision);
    assert.equal(snapshot.chunks[0]?.text, changed.chunks[0]?.text);
  });

  it("does not fabricate a capture time from an invalid metadata type", async () => {
    const file = await fixture();
    await writeFile(file, JSON.stringify({ id: "a", pageId: "p", url: "https://getquicker.net/KC", title: "Page", sourceType: "manual", sectionPath: [], text: "text", contentHash: "declared", fetchedAt: 42 }));
    await assert.rejects(loadQuickerKnowledgeCorpusSnapshot(file), /fetchedAt must be a string or null/);
  });
});
