import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import { extractMessageCopyText } from "./extract-message-copy-text";

test("extractMessageCopyText returns user markup for paste round-trip", () => {
  const message: AgentUIMessage = {
    id: "u1",
    role: "user",
    parts: [
      {
        type: "text",
        text: '<qkrpc-action-tag data-id="abc" data-title="Demo"></qkrpc-action-tag> hello',
      },
    ],
  };
  assert.equal(
    extractMessageCopyText(message),
    '<qkrpc-action-tag data-id="abc" data-title="Demo"></qkrpc-action-tag> hello',
  );
});

test("extractMessageCopyText joins assistant text parts", () => {
  const message: AgentUIMessage = {
    id: "a1",
    role: "assistant",
    parts: [
      { type: "text", text: "First paragraph." },
      { type: "text", text: "Second paragraph." },
    ],
  };
  assert.equal(
    extractMessageCopyText(message),
    "First paragraph.\n\nSecond paragraph.",
  );
});

test("extractMessageCopyText strips reasoning wrappers from assistant text", () => {
  const wrapped = ["hidden", "<", "/think", ">", "Visible answer."].join("");
  const message: AgentUIMessage = {
    id: "a2",
    role: "assistant",
    parts: [{ type: "text", text: wrapped }],
  };
  assert.equal(extractMessageCopyText(message), "Visible answer.");
});
