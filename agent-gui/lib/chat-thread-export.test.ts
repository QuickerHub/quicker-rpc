import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChatThreadExportFilename,
  buildChatThreadExportPayload,
  CHAT_THREAD_EXPORT_FORMAT,
  CHAT_THREAD_EXPORT_VERSION,
  countUserTurns,
  serializeChatThreadExport,
} from "@/lib/chat-thread-export";
import type { ChatThread } from "@/lib/chat-store";
import type { AgentUIMessage } from "@/lib/chat-types";

const baseThread: ChatThread = {
  id: "11111111-2222-3333-4444-555555555555",
  title: "Fix CSV sum action",
  messages: [],
  updatedAt: 1_700_000_000_000,
  workingDirectory: "D:\\workspace",
  titleManual: true,
};

const messages: AgentUIMessage[] = [
  {
    id: "u1",
    role: "user",
    parts: [{ type: "text", text: "help me fix this" }],
  },
  {
    id: "a1",
    role: "assistant",
    parts: [{ type: "text", text: "Searching…" }],
    metadata: {
      model: "gpt-test",
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
    },
  },
];

test("buildChatThreadExportPayload includes format, thread meta, and usage stats", () => {
  const payload = buildChatThreadExportPayload(baseThread, messages, {
    exportedAt: 1_700_000_100_000,
  });

  assert.equal(payload.format, CHAT_THREAD_EXPORT_FORMAT);
  assert.equal(payload.version, CHAT_THREAD_EXPORT_VERSION);
  assert.equal(payload.exportedAt, new Date(1_700_000_100_000).toISOString());
  assert.equal(payload.thread.id, baseThread.id);
  assert.equal(payload.thread.workingDirectory, baseThread.workingDirectory);
  assert.equal(payload.stats.messageCount, 2);
  assert.equal(payload.stats.userTurnCount, 1);
  assert.equal(payload.stats.sessionUsage.inputTokens, 100);
  assert.deepEqual(payload.messages, messages);
});

test("buildChatThreadExportPayload prefers liveMessages over stored messages", () => {
  const live: AgentUIMessage[] = [
    {
      id: "u-live",
      role: "user",
      parts: [{ type: "text", text: "live snapshot" }],
    },
  ];
  const payload = buildChatThreadExportPayload(
    { ...baseThread, messages },
    messages,
    { liveMessages: live },
  );
  assert.deepEqual(payload.messages, live);
  assert.equal(payload.stats.messageCount, 1);
});

test("countUserTurns counts only user messages", () => {
  assert.equal(countUserTurns(messages), 1);
});

test("buildChatThreadExportFilename sanitizes title and includes short id", () => {
  const filename = buildChatThreadExportFilename(
    { id: baseThread.id, title: "Hello: world?" },
    1_700_000_100_000,
  );
  assert.match(filename, /^quicker-agent-Hello-world-11111111-/);
  assert.ok(filename.endsWith(".json"));
});

test("serializeChatThreadExport returns pretty JSON with trailing newline", () => {
  const payload = buildChatThreadExportPayload(baseThread, messages);
  const text = serializeChatThreadExport(payload);
  assert.ok(text.endsWith("\n"));
  assert.equal(JSON.parse(text).format, CHAT_THREAD_EXPORT_FORMAT);
});
