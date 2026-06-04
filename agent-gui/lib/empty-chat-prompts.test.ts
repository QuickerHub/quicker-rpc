import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMPTY_CHAT_ACTION_PROMPTS,
  EMPTY_CHAT_PROMPT_CATEGORY_ORDER,
  groupEmptyChatPromptsByCategory,
} from "@/lib/empty-chat-prompts";

describe("empty-chat-prompts", () => {
  it("has unique ids and required fields", () => {
    const ids = new Set<string>();
    for (const p of EMPTY_CHAT_ACTION_PROMPTS) {
      assert.ok(p.id.length > 0, "id");
      assert.ok(p.label.length > 0, "label");
      assert.ok(p.hint.length > 0, "hint");
      assert.ok(p.text.length > 20, `text too short: ${p.id}`);
      assert.ok(!ids.has(p.id), `duplicate id: ${p.id}`);
      ids.add(p.id);
    }
  });

  it("covers every category in display order", () => {
    const grouped = groupEmptyChatPromptsByCategory();
    const present = new Set(grouped.map((g) => g.category));
    for (const cat of EMPTY_CHAT_PROMPT_CATEGORY_ORDER) {
      assert.ok(present.has(cat), `missing category: ${cat}`);
    }
  });

  it("includes smoke read-only and authoring mutating cases", () => {
    const readOnly = EMPTY_CHAT_ACTION_PROMPTS.filter((p) => p.readOnly);
    const authoring = EMPTY_CHAT_ACTION_PROMPTS.filter(
      (p) => p.category === "authoring",
    );
    assert.ok(readOnly.length >= 3);
    assert.ok(authoring.length >= 5);
  });

  it("grouped items sum to full list", () => {
    const grouped = groupEmptyChatPromptsByCategory();
    const n = grouped.reduce((acc, g) => acc + g.items.length, 0);
    assert.equal(n, EMPTY_CHAT_ACTION_PROMPTS.length);
  });
});
