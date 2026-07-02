import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { QuickerKnowledgeSearchResult } from "@/lib/quicker-knowledge/types";
import { reciprocalRankFusion } from "@/lib/quicker-knowledge/hybrid";
import { cosineSimilarity } from "@/lib/quicker-knowledge/vector";

const keyword: QuickerKnowledgeSearchResult[] = [
  {
    title: "动作面板",
    url: "https://getquicker.net/KC/Manual",
    sectionPath: ["动作面板"],
    sourceType: "manual",
    score: 10,
    snippet: "动作面板可以按软件切换。",
  },
  {
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
    title: "用户输入",
    url: "https://getquicker.net/kc/help/doc/form",
    sectionPath: ["用户输入"],
    sourceType: "action_dev",
    score: 0.98,
    snippet: "用户输入支持多字段。",
  },
];

describe("quicker knowledge hybrid search", () => {
  it("computes cosine similarity", () => {
    assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
    assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  });

  it("fuses keyword and vector lists without duplicates", () => {
    const fused = reciprocalRankFusion({ keyword, vector, limit: 5 });
    assert.equal(fused.length, 2);
    assert.equal(fused.filter((x) => x.url.includes("form")).length, 1);
    assert.ok(fused[0]!.score > 0);
  });
});
