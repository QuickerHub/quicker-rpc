import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatContextCompressionMetadata,
  hasReinjectBlock,
} from "@/lib/context-compression-metadata-display";

describe("formatContextCompressionMetadata", () => {
  it("includes v2 metadata flags", () => {
    const line = formatContextCompressionMetadata({
      summary: "x",
      throughMessageId: "u-1",
      sourceInputTokens: 1,
      createdAt: 1,
      recentMessagesKept: 4,
      totalMessagesAtCreation: 10,
      splitReason: "token_budget",
      microcompactApplied: true,
      summaryReused: true,
      reactiveCompactAttempted: true,
      reinjectPaths: ["actions/demo/data.json"],
    });
    assert.match(line, /token_budget/);
    assert.match(line, /microcompact/);
    assert.match(line, /reused summary/);
    assert.match(line, /reactive retry/);
    assert.match(line, /reinject actions\/demo\/data\.json/);
  });
});

describe("hasReinjectBlock", () => {
  it("detects reinject heading in system suffix", () => {
    assert.equal(
      hasReinjectBlock(
        "Historical context summary...\n\nRecent workspace files (reinjected after compression):\n### a.txt",
      ),
      true,
    );
    assert.equal(hasReinjectBlock("Historical only"), false);
  });
});
