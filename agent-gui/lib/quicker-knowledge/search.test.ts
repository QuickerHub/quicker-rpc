import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { QuickerKnowledgeChunk } from "@/lib/quicker-knowledge/types";
import {
  buildQuickerKnowledgeKeywordIndex,
  searchQuickerKnowledge,
  tokenizeQuickerKnowledgeText,
} from "@/lib/quicker-knowledge/search";

const CHUNKS: QuickerKnowledgeChunk[] = [
  {
    id: "manual-panel",
    pageId: "p1",
    url: "https://getquicker.net/KC/Manual",
    title: "动作面板",
    sectionPath: ["动作面板", "按场景切换"],
    sourceType: "manual",
    text: "动作面板可以为不同进程设置不同动作页。",
    tokenEstimate: 20,
    contentHash: "a",
  },
  {
    id: "form",
    pageId: "p2",
    url: "https://getquicker.net/kc/help/doc/form",
    title: "用户输入",
    sectionPath: ["用户输入"],
    sourceType: "action_dev",
    text: "sys:form 支持文本、数字、多字段表单。",
    tokenEstimate: 20,
    contentHash: "b",
  },
];

describe("quicker knowledge search", () => {
  it("tokenizes Chinese and identifiers", () => {
    const tokens = tokenizeQuickerKnowledgeText("动作面板 sys:form getquicker");
    assert.ok(tokens.includes("动作面板"));
    assert.ok(tokens.includes("动作"));
    assert.ok(tokens.includes("sys"));
    assert.ok(tokens.includes("form"));
    assert.ok(tokens.includes("getquicker"));
  });

  it("finds Chinese usage questions", () => {
    const index = buildQuickerKnowledgeKeywordIndex(CHUNKS);
    const hits = searchQuickerKnowledge(index, { query: "不同软件显示不同动作面板", limit: 3 });
    assert.equal(hits[0]?.url, "https://getquicker.net/KC/Manual");
    assert.match(hits[0]!.snippet, /动作面板/);
  });

  it("filters by source type", () => {
    const index = buildQuickerKnowledgeKeywordIndex(CHUNKS);
    const hits = searchQuickerKnowledge(index, {
      query: "用户输入 表单",
      limit: 3,
      sourceType: "action_dev",
    });
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.sourceType, "action_dev");
  });
});
