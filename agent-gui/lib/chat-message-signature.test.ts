import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import { chatMessagesEqual, chatMessagesSignature } from "./chat-message-signature.ts";

function msg(id: string, text: string): AgentUIMessage {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text }],
  };
}

test("chatMessagesEqual detects same-length text changes", () => {
  assert.equal(chatMessagesEqual([msg("m1", "abcd")], [msg("m1", "wxyz")]), false);
});

test("chatMessagesSignature is stable for equivalent snapshots", () => {
  assert.equal(
    chatMessagesSignature([msg("m1", "hello")]),
    chatMessagesSignature([msg("m1", "hello")]),
  );
});
