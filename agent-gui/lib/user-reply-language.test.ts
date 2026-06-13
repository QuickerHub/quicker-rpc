import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  formatUserLanguageForSystem,
  inferUserReplyLanguage,
  inferUserReplyLanguageFromMessages,
} from "@/lib/user-reply-language";

describe("inferUserReplyLanguage", () => {
  it("detects Chinese prose", () => {
    assert.equal(inferUserReplyLanguage("帮我创建一个剪贴板动作"), "zh");
  });

  it("detects English prose", () => {
    assert.equal(inferUserReplyLanguage("Now let me create the action."), "en");
  });

  it("prefers Chinese when mixed but CJK dominates", () => {
    assert.equal(inferUserReplyLanguage("用 clipboard 创建一个动作"), "zh");
  });

  it("returns null for empty or symbol-only input", () => {
    assert.equal(inferUserReplyLanguage(""), null);
    assert.equal(inferUserReplyLanguage("👍"), null);
  });
});

describe("inferUserReplyLanguageFromMessages", () => {
  it("uses recent user messages", () => {
    const messages: AgentUIMessage[] = [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "帮我写个动作" }],
      },
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "text", text: "Now let me create the action." }],
      },
      {
        id: "u2",
        role: "user",
        parts: [{ type: "text", text: "继续，表达式放到 eval 文件" }],
      },
    ];
    assert.equal(inferUserReplyLanguageFromMessages(messages), "zh");
  });
});

describe("formatUserLanguageForSystem", () => {
  it("includes no-mix rule", () => {
    const block = formatUserLanguageForSystem("zh");
    assert.match(block, /Chinese only/);
    assert.match(block, /Do not mix English/);
  });
});
