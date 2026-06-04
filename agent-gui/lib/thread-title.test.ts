import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  deriveProvisionalThreadTitle,
  extractTitleConversationText,
  fallbackCompressTitleFromUserLine,
  isNearVerbatimThreadTitle,
  isProvisionalTitleSufficient,
  isTitleWithinSidebarLimit,
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

test("isProvisionalTitleSufficient accepts concrete first user titles", () => {
  assert.equal(isProvisionalTitleSufficient("剪贴板去重"), true);
  assert.equal(isProvisionalTitleSufficient("新对话"), false);
  assert.equal(isProvisionalTitleSufficient("你好"), false);
});

test("isProvisionalTitleSufficient rejects long first user titles", () => {
  const long =
    "新建动作：读剪贴板文本，按行去重、排序后写回，并提示处理前后行数。";
  assert.equal(isProvisionalTitleSufficient(long), false);
});

test("isNearVerbatimThreadTitle detects echo of user line", () => {
  const user = "新建动作：读剪贴板文本，按行去重、排序后写回，并提示处理前后行数。";
  assert.equal(isNearVerbatimThreadTitle(user, user), true);
  assert.equal(isNearVerbatimThreadTitle("剪贴板去重", user), false);
});

test("fallbackCompressTitleFromUserLine shortens action requests", () => {
  const user = "新建动作：读剪贴板文本，按行去重、排序后写回，并提示处理前后行数。";
  const title = fallbackCompressTitleFromUserLine(user);
  assert.ok(isTitleWithinSidebarLimit(title));
  assert.ok(!isNearVerbatimThreadTitle(title, user));
});

test("extractTitleConversationText caps assistant reply per line", () => {
  const long = "x".repeat(500);
  const messages: AgentUIMessage[] = [
    { id: "u1", role: "user", parts: [{ type: "text", text: "短问题" }] },
    { id: "a1", role: "assistant", parts: [{ type: "text", text: long }] },
  ];
  const text = extractTitleConversationText(messages);
  assert.ok(text.includes("短问题"));
  assert.ok(text.length < 500);
  assert.ok(!text.includes("x".repeat(400)));
});
