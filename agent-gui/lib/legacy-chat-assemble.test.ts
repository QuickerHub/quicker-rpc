import assert from "node:assert/strict";
import test from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import { CHAT_STORE_VERSION } from "@/lib/chat-store-persist";
import { assembleChatStoreCandidatesFromLegacyHits } from "@/lib/legacy-chat-assemble";

function sampleMessage(id: string): AgentUIMessage {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text: "hello" }],
  };
}

test("assembleChatStoreCandidatesFromLegacyHits merges v3 index with thread blobs", () => {
  const threadId = "11111111-1111-4111-8111-111111111111";
  const index = {
    version: CHAT_STORE_VERSION,
    activeThreadId: threadId,
    openTabIds: [threadId],
    workingDirectory: "",
    threads: [
      {
        id: threadId,
        title: "disk chat",
        updatedAt: 1,
        titleGenerated: false,
        titleManual: false,
      },
    ],
  };
  const threadBlob = {
    version: 1,
    threadId,
    messages: [sampleMessage("chunked")],
  };

  const candidates = assembleChatStoreCandidatesFromLegacyHits([
    {
      source: "LevelDB · a.ldb",
      storageKey: "agent-gui-chats",
      json: JSON.stringify(index),
    },
    {
      source: "LevelDB · a.ldb",
      storageKey: "agent-gui-chats-thread-",
      json: JSON.stringify(threadBlob),
    },
  ]);

  assert.equal(candidates.length, 1);
  assert.equal(
    candidates[0]!.data.threads.find((thread) => thread.id === threadId)?.messages[0]?.id,
    "chunked",
  );
});

test("assembleChatStoreCandidatesFromLegacyHits recovers orphan thread shards", () => {
  const threadId = "22222222-2222-4222-8222-222222222222";
  const threadBlob = {
    version: 1,
    threadId,
    messages: [sampleMessage("orphan")],
  };

  const candidates = assembleChatStoreCandidatesFromLegacyHits([
    {
      source: "LevelDB · b.ldb",
      storageKey: "agent-gui-chats-thread-",
      json: JSON.stringify(threadBlob),
    },
  ]);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]!.source, "孤立线程分片");
  assert.equal(candidates[0]!.data.threads[0]!.messages[0]!.id, "orphan");
});
