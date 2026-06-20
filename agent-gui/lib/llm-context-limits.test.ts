import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEEPSEEK_COMPACTION_BUDGET_TOKENS,
  DEFAULT_MODEL_CONTEXT_TOKENS,
  resolveModelContextLimit,
} from "@/lib/llm-context-limits";

describe("resolveModelContextLimit", () => {
  it("uses a raised compaction budget for DeepSeek V4 instead of 1M API max", () => {
    for (const modelId of [
      "deepseek-v4-pro",
      "deepseek-v4-flash",
      "deepseek-chat",
      "deepseek-reasoner",
      "z-ai/deepseek-v4",
    ]) {
      const resolved = resolveModelContextLimit(modelId);
      assert.equal(resolved.tokens, DEEPSEEK_COMPACTION_BUDGET_TOKENS);
      assert.equal(resolved.apiMaxTokens, 1_000_000);
      assert.notEqual(resolved.tokens, 1_000_000);
    }
  });

  it("keeps GPT-5.5 at 272k", () => {
    const resolved = resolveModelContextLimit("gpt-5.5");
    assert.equal(resolved.tokens, 272_000);
    assert.equal(resolved.apiMaxTokens, undefined);
  });

  it("falls back to default for unknown models", () => {
    const resolved = resolveModelContextLimit("unknown-model-xyz");
    assert.equal(resolved.tokens, DEFAULT_MODEL_CONTEXT_TOKENS);
    assert.equal(resolved.source, "default");
  });
});
