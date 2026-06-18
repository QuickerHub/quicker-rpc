import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  buildApiContextUsageSnapshot,
  getLatestContextCompressionSummary,
} from "@/lib/context-length";
import {
  resolveContextSplitIndex,
  resolveCompactionUsageThreshold,
  selectReusableContextSummary,
  shouldCompressContextMessages,
  previewContextCompression,
  prepareCompressedContext,
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

  it("returns true when latest inputTokens reach ~90% of window", () => {
    const contextLimit = 128_000;
    const threshold = resolveCompactionUsageThreshold(contextLimit);
    const messages = [
      userMessage("u1", "hello"),
      assistantMessage("a1", "hi", { inputTokens: threshold }),
    ];
    assert.equal(shouldCompressContextMessages(messages, contextLimit), true);
    assert.ok(threshold >= Math.floor(contextLimit * 0.9) - 1);
  });

  it("preferTokenEstimate ignores high usage metadata when bodies are small", () => {
    const contextLimit = 128_000;
    const threshold = resolveCompactionUsageThreshold(contextLimit);
    const messages = [
      userMessage("u1", "hello"),
      assistantMessage("a1", "hi", { inputTokens: threshold }),
    ];
    assert.equal(
      shouldCompressContextMessages(messages, contextLimit, {
        preferTokenEstimate: true,
      }),
      false,
    );
  });
});

describe("resolveContextSplitIndex", () => {
  it("keeps all messages when thread fits recent token budget", () => {
    const split = resolveContextSplitIndex(buildLongThread(10), 128_000);
    assert.equal(split.splitIndex, 0);
    assert.equal(split.splitReason, "none");
  });

  it("splits heavy short thread by token budget", () => {
    const messages: AgentUIMessage[] = [
      userMessage("u1", "goal: sync clipboard"),
      {
        id: "a1",
        role: "assistant",
        parts: [{
          type: "tool-shell_exec",
          toolCallId: "c1",
          state: "output-available",
          input: { command: "rg foo" },
          output: { ok: true, stdout: "x".repeat(200_000) },
        }],
      },
      userMessage("u2", "continue"),
    ];
    const split = resolveContextSplitIndex(messages, 32_000);
    assert.ok(split.splitIndex > 0);
    assert.equal(split.splitReason, "token_budget");
  });

  it("uses usage fallback when API usage is high but estimate is low", () => {
    const split = resolveContextSplitIndex(buildLongThread(16), 128_000, {
      usageIndicatesPressure: true,
    });
    assert.ok(split.splitIndex > 0);
    assert.equal(split.splitReason, "usage_fallback");
  });
});

describe("previewContextCompression", () => {
  it("reports split and threshold diagnostics", () => {
    const contextLimit = 128_000;
    const threshold = resolveCompactionUsageThreshold(contextLimit);
    const messages = [
      ...buildLongThread(16),
      assistantMessage("a-last", "ok", { inputTokens: threshold }),
    ];
    const preview = previewContextCompression(messages, contextLimit);
    assert.equal(preview.shouldCompress, true);
    assert.ok(preview.splitIndex > 0);
    assert.equal(preview.recentCount, messages.length - preview.splitIndex);
    assert.equal(preview.latestInputTokens, threshold);
    assert.equal(preview.usageThreshold, threshold);
    assert.ok(preview.recentTokenBudget > 0);
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
    const splitIndex = resolveContextSplitIndex(messages, 128_000, {
      usageIndicatesPressure: true,
    }).splitIndex;
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
    const splitIndex = resolveContextSplitIndex(messages, 128_000, {
      usageIndicatesPressure: true,
    }).splitIndex;
    assert.equal(selectReusableContextSummary(messages, splitIndex), null);
  });
});

describe("prepareCompressedContext reasoning history", () => {
  it("preserves assistant reasoning for DeepSeek multi-turn", async () => {
    const messages: AgentUIMessage[] = [
      userMessage("u1", "hi"),
      {
        id: "a1",
        role: "assistant",
        parts: [
          { type: "reasoning", text: "thinking", state: "done" },
          { type: "text", text: "hello" },
        ],
      },
      userMessage("u2", "again"),
    ];

    const prepared = await prepareCompressedContext({
      messages,
      model: {} as never,
      contextLimit: 128_000,
      usageTracking: {
        selection: { kind: "builtin", providerId: "deepseek" },
        modelId: "deepseek-v4-pro",
      },
    });

    const assistant = prepared.modelMessages.find(
      (message) => message.role === "assistant",
    );
    assert.ok(assistant);
    assert.ok(Array.isArray(assistant.content));
    assert.ok(
      assistant.content.some(
        (part) =>
          typeof part === "object"
          && part != null
          && "type" in part
          && part.type === "reasoning",
      ),
    );
  });

  it("preserves assistant reasoning on short threads without pruning", async () => {
    const messages: AgentUIMessage[] = [
      userMessage("u1", "hi"),
      {
        id: "a1",
        role: "assistant",
        parts: [
          { type: "reasoning", text: "thinking", state: "done" },
          { type: "text", text: "hello" },
        ],
      },
      userMessage("u2", "again"),
    ];

    const prepared = await prepareCompressedContext({
      messages,
      model: {} as never,
      contextLimit: 128_000,
      usageTracking: {
        selection: { kind: "builtin", providerId: "bingleimuzi" },
        modelId: "gpt-5.5",
      },
    });

    const assistant = prepared.modelMessages.find(
      (message) => message.role === "assistant",
    );
    assert.ok(assistant);
    assert.ok(Array.isArray(assistant.content));
    assert.ok(
      assistant.content.some(
        (part) =>
          typeof part === "object"
          && part != null
          && "type" in part
          && part.type === "reasoning",
      ),
    );
  });

  it("preserves tool outputs on short multi-step threads", async () => {
    const messages: AgentUIMessage[] = [
      userMessage("u1", "create action"),
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-qkrpc_action_create",
            toolCallId: "call-create",
            state: "output-available",
            input: { info: { title: "Demo" } },
            output: {
              ok: true,
              exitCode: 0,
              data: { actionId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" },
            },
          },
          { type: "text", text: "created" },
        ],
      },
      userMessage("u2", "continue editing"),
    ];

    const prepared = await prepareCompressedContext({
      messages,
      model: {} as never,
      contextLimit: 128_000,
    });

    assert.equal(prepared.compressed, false);
    let toolResults = 0;
    for (const message of prepared.modelMessages) {
      if (!Array.isArray(message.content)) continue;
      for (const part of message.content) {
        if (
          typeof part === "object"
          && part != null
          && "type" in part
          && part.type === "tool-result"
        ) {
          toolResults += 1;
        }
      }
    }
    assert.ok(toolResults > 0, "tool results must survive short-thread path");
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
