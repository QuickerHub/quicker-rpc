import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  prepareCompressedContext,
  resolveCompactionUsageThreshold,
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

describe("prepareCompressedContext integration", () => {
  it("compresses long threads when usage threshold is met", async () => {
    const summarizeOlderMessages = mock.fn(async () => "mock summary bullets");
    const messages = buildLongThread(16);
    const latestAssistant = messages[messages.length - 1]!;
    assert.equal(latestAssistant.role, "assistant");
    latestAssistant.metadata = {
      inputTokens: resolveCompactionUsageThreshold(128_000),
    };

    const prepared = await prepareCompressedContext({
      messages,
      model: {} as never,
      contextLimit: 128_000,
      summarizeOlderMessages,
    });

    assert.equal(prepared.compressed, true);
    assert.match(prepared.systemSuffix ?? "", /mock summary bullets/);
    assert.equal(prepared.contextCompression?.summary, "mock summary bullets");
    assert.equal(prepared.contextCompression?.throughMessageId, "a-3");
    assert.equal(summarizeOlderMessages.mock.callCount(), 1);
    assert.ok(prepared.modelMessages.length >= 8);
    assert.equal(prepared.contextCompression?.splitReason, "usage_fallback");
  });

  it("reuses prior summary without calling summarizeOlderMessages", async () => {
    const summarizeOlderMessages = mock.fn(async () => "should not run");
    const messages = [
      ...buildLongThread(14),
      assistantMessage("a-summary", "done", {
        inputTokens: resolveCompactionUsageThreshold(128_000) + 1_000,
        contextCompression: {
          summary: "reused summary",
          throughMessageId: "u-10",
          sourceInputTokens: 90_000,
          createdAt: 1,
          recentMessagesKept: 12,
          totalMessagesAtCreation: 14,
        },
      }),
      userMessage("u-new", "continue"),
    ];

    const prepared = await prepareCompressedContext({
      messages,
      model: {} as never,
      contextLimit: 128_000,
      summarizeOlderMessages,
    });

    assert.equal(prepared.compressed, true);
    assert.equal(prepared.contextCompression?.summary, "reused summary");
    assert.equal(summarizeOlderMessages.mock.callCount(), 0);
  });

  it("appends reinject block when hook returns paths", async () => {
    const messages = buildLongThread(16);
    const latestAssistant = messages[messages.length - 1]!;
    latestAssistant.metadata = {
      inputTokens: resolveCompactionUsageThreshold(128_000),
    };

    const prepared = await prepareCompressedContext({
      messages,
      model: {} as never,
      contextLimit: 128_000,
      summarizeOlderMessages: async () => "mock summary",
      reinjectRecentPatches: async () => ({
        block: "Recent workspace files (reinjected after compression):\n### demo/data.json\n{}",
        paths: ["demo/data.json"],
      }),
    });

    assert.equal(prepared.compressed, true);
    assert.match(prepared.systemSuffix ?? "", /reinjected after compression/);
    assert.deepEqual(prepared.contextCompression?.reinjectPaths, ["demo/data.json"]);
  });
});
