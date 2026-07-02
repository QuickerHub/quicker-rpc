import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  QuickerKnowledgeChunk,
  QuickerKnowledgeSearchResult,
} from "@/lib/quicker-knowledge/types";
import { reciprocalRankFusion } from "@/lib/quicker-knowledge/hybrid";
import {
  buildQuickerKnowledgeVectorIndex,
  cosineSimilarity,
  searchQuickerKnowledgeVectors,
} from "@/lib/quicker-knowledge/vector";

const keyword: QuickerKnowledgeSearchResult[] = [
  {
    chunkId: "manual-panel",
    title: "动作面板",
    url: "https://getquicker.net/KC/Manual",
    sectionPath: ["动作面板"],
    sourceType: "manual",
    score: 10,
    snippet: "动作面板可以按软件切换。",
  },
  {
    chunkId: "form",
    title: "用户输入",
    url: "https://getquicker.net/kc/help/doc/form",
    sectionPath: ["用户输入"],
    sourceType: "action_dev",
    score: 5,
    snippet: "用户输入支持多字段。",
  },
];

const vector: QuickerKnowledgeSearchResult[] = [
  {
    chunkId: "form",
    title: "用户输入",
    url: "https://getquicker.net/kc/help/doc/form",
    sectionPath: ["用户输入"],
    sourceType: "action_dev",
    score: 0.98,
    snippet: "用户输入支持多字段。",
  },
];

const vectorChunks: QuickerKnowledgeChunk[] = [
  {
    id: "valid-vector",
    pageId: "p1",
    url: "https://getquicker.net/kc/help/doc/valid-vector",
    title: "有效向量",
    sectionPath: ["向量"],
    sourceType: "kb",
    text: "有效向量应该在过期向量之后仍然返回。",
    tokenEstimate: 20,
    contentHash: "valid",
  },
];

describe("quicker knowledge hybrid search", () => {
  it("computes cosine similarity", () => {
    assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
    assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  });

  it("skips stale vector records before applying the result limit", () => {
    const index = buildQuickerKnowledgeVectorIndex(vectorChunks, [
      { chunkId: "missing-vector", embedding: [1, 0] },
      { chunkId: "valid-vector", embedding: [0.9, 0.1] },
    ]);

    const hits = searchQuickerKnowledgeVectors({
      index,
      queryEmbedding: [1, 0],
      limit: 1,
    });

    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.chunkId, "valid-vector");
  });

  it("fuses keyword and vector lists without duplicates", () => {
    const fused = reciprocalRankFusion({ keyword, vector, limit: 5 });
    assert.equal(fused.length, 2);
    assert.equal(fused.filter((x) => x.url.includes("form")).length, 1);
    assert.ok(fused[0]!.score > 0);
  });

  it("keeps distinct chunks that share a URL and section path", () => {
    const sharedSectionResults: QuickerKnowledgeSearchResult[] = [
      {
        chunkId: "shared-a",
        title: "共享章节",
        url: "https://getquicker.net/KC/Shared",
        sectionPath: ["共享章节"],
        sourceType: "manual",
        score: 10,
        snippet: "第一段。",
      },
      {
        chunkId: "shared-b",
        title: "共享章节",
        url: "https://getquicker.net/KC/Shared",
        sectionPath: ["共享章节"],
        sourceType: "manual",
        score: 9,
        snippet: "第二段。",
      },
    ];

    const fused = reciprocalRankFusion({
      keyword: sharedSectionResults,
      vector: [],
      limit: 5,
    });

    assert.deepEqual(
      fused.map((result) => result.chunkId).sort(),
      ["shared-a", "shared-b"],
    );
  });

  it("uses the default k when k is not a positive finite number", () => {
    const nanK = reciprocalRankFusion({ keyword, vector, k: Number.NaN });
    const negativeK = reciprocalRankFusion({ keyword, vector, k: -1 });

    assert.ok(nanK.every((result) => Number.isFinite(result.score)));
    assert.ok(negativeK.every((result) => Number.isFinite(result.score)));
  });
});
