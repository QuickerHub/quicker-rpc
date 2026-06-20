import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatAgentEvalChatError } from "@/lib/agent-eval/eval-chat-error";

describe("formatAgentEvalChatError", () => {
  it("adds probe hint for Gone / 410 LLM failures", () => {
    const hint = formatAgentEvalChatError("Gone");
    assert.ok(hint?.includes("410"));
    assert.ok(hint?.includes("probe:llm-configs"));
  });

  it("passes through other errors unchanged", () => {
    assert.equal(formatAgentEvalChatError("rate limited"), "rate limited");
  });
});
