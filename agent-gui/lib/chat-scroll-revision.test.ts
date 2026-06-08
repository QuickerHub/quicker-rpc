import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import { buildChatScrollRevisionKey } from "./chat-scroll-revision.ts";

function msg(id: string, text: string): AgentUIMessage {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text }],
  };
}

test("buildChatScrollRevisionKey changes when tail text grows during streaming", () => {
  const a = buildChatScrollRevisionKey([msg("m1", "hi")], "streaming", undefined);
  const b = buildChatScrollRevisionKey(
    [msg("m1", "hello world")],
    "streaming",
    undefined,
  );
  assert.notEqual(a, b);
});

test("buildChatScrollRevisionKey is stable across identical message snapshots", () => {
  const messages = [msg("m1", "same")];
  const key = buildChatScrollRevisionKey(messages, "ready", undefined);
  assert.equal(buildChatScrollRevisionKey(messages, "ready", undefined), key);
});
