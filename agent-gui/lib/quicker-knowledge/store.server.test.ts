import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";

import { loadQuickerKnowledgeChunksFromJsonl } from "@/lib/quicker-knowledge/store.server";

describe("quicker knowledge store", () => {
  it("loads valid chunk jsonl and skips blank lines", async () => {
    const dir = join(tmpdir(), `qk-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const file = join(dir, "chunks.jsonl");
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

    try {
      const chunks = await loadQuickerKnowledgeChunksFromJsonl(file);
      assert.equal(chunks.length, 1);
      assert.equal(chunks[0]!.title, "Quicker");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects invalid source types with a line-numbered error", async () => {
    const dir = join(tmpdir(), `qk-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const file = join(dir, "chunks.jsonl");
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

    try {
      await assert.rejects(
        loadQuickerKnowledgeChunksFromJsonl(file),
        (error) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /line 1/);
          assert.match(error.message, /sourceType/);
          return true;
        },
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
