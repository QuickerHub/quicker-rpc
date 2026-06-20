import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatIntentMatchedSkillsForPrompt } from "@/lib/agent-skills/skill-intent-preload";

describe("static shell intent preload segment", () => {
  it("authoring sample text produces measurable intent-matched block", async () => {
    const block = await formatIntentMatchedSkillsForPrompt({
      userText: "创建一个调用 REST API 并解析 JSON 字段的动作",
      chatMode: "agent",
    });
    assert.ok(block.includes("quicker-authoring-http-json-api"));
    assert.ok(block.length > 200);
  });
});
