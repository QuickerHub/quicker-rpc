import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  deriveProvisionalThreadTitle,
  sanitizeThreadTitle,
} from "./thread-title";

test("deriveProvisionalThreadTitle uses action tag title when body empty", () => {
  const messages: AgentUIMessage[] = [
    {
      id: "u1",
      role: "user",
      parts: [
        {
          type: "text",
          text: '<qkrpc-action-tag data-id="e0ac442e-6241-4f89-9a20-494dee157b89" data-title="剪贴板去重"></qkrpc-action-tag>',
        },
      ],
    },
  ];
  assert.equal(deriveProvisionalThreadTitle(messages), "剪贴板去重");
});

test("sanitizeThreadTitle rejects empty and keeps short text", () => {
  assert.equal(sanitizeThreadTitle(""), "新对话");
  assert.equal(sanitizeThreadTitle("  修复 data.json  "), "修复 data.json");
});
