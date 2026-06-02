import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  buildApiContextUsageSnapshot,
  getLatestContextCompressionSummary,
} from "@/lib/context-length";
import {
  resolveContextSplitIndex,
  selectReusableContextSummary,
  shouldCompressContextMessages,
} from "@/lib/context-compression";

function userMessage(id: string, text: string): AgentUIMessage {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text }],
  };
}

function assistantMessage(
  id: string,
  text: string,
  metadata?: AgentUIMessage["metadata"],
): AgentUIMessage {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text }],
    metadata,
  };
}

function buildLongThread(messageCount: number): AgentUIMessage[] {
  const messages: AgentUIMessage[] = [];
  for (let i = 0; i < messageCount; i += 1) {
    if (i % 2 === 0) {
      messages.push(userMessage(`u-${i}`, `user turn ${i}`));
    } else {
      messages.push(assistantMessage(`a-${i}`, `assistant turn ${i}`));
    }
  }
  return messages;
}

describe("shouldCompressContextMessages", () => {
  it("returns false below usage and estimate thresholds", () => {
    const messages = [
      userMessage("u1", "hello"),
      assistantMessage("a1", "hi", { inputTokens: 1000 }),
    ];
    assert.equal(shouldCompressContextMessages(messages, 128_000), false);
  });

  it("returns true when latest inputTokens reach 70% of window", () => {
    const messages = [
      userMessage("u1", "hello"),
      assistantMessage("a1", "hi", { inputTokens: 90_000 }),
    ];
    assert.equal(shouldCompressContextMessages(messages, 128_000), true);
  });
});

describe("resolveContextSplitIndex", () => {
  it("keeps all messages when count is within recent window", () => {
    assert.equal(resolveContextSplitIndex(buildLongThread(10)), 0);
  });

  it("splits older messages when count exceeds recent window", () => {
    assert.equal(resolveContextSplitIndex(buildLongThread(20)), 8);
  });
});

describe("selectReusableContextSummary", () => {
  it("reuses summary when throughMessageId still covers older slice", () => {
    const messages = [
      ...buildLongThread(14),
      assistantMessage("a-summary", "done", {
        contextCompression: {
          summary: "prior summary",
          throughMessageId: "u-10",
          sourceInputTokens: 80_000,
          createdAt: 1,
          recentMessagesKept: 12,
          totalMessagesAtCreation: 14,
        },
      }),
    ];
    const splitIndex = resolveContextSplitIndex(messages);
    assert.equal(selectReusableContextSummary(messages, splitIndex), "prior summary");
  });

  it("returns null when prior summary no longer covers older slice", () => {
    const messages = [
      ...buildLongThread(20),
      assistantMessage("a-summary", "done", {
        contextCompression: {
          summary: "stale summary",
          throughMessageId: "u-0",
          sourceInputTokens: 80_000,
          createdAt: 1,
          recentMessagesKept: 12,
          totalMessagesAtCreation: 20,
        },
      }),
    ];
    const splitIndex = resolveContextSplitIndex(messages);
    assert.equal(selectReusableContextSummary(messages, splitIndex), null);
  });
});

describe("context-length compression snapshot", () => {
  it("surfaces latest compression summary in usage snapshot", () => {
    const messages = [
      userMessage("u1", "hello"),
      assistantMessage("a1", "ok", {
        inputTokens: 50_000,
        contextCompression: {
          summary: "compressed history",
          throughMessageId: "u1",
          sourceInputTokens: 48_000,
          createdAt: 1,
          recentMessagesKept: 12,
          totalMessagesAtCreation: 2,
        },
      }),
    ];
    assert.equal(getLatestContextCompressionSummary(messages), "compressed history");
    const snapshot = buildApiContextUsageSnapshot(messages, 128_000);
    assert.equal(snapshot.compressionSummary, "compressed history");
    assert.equal(snapshot.hasData, true);
  });
});
