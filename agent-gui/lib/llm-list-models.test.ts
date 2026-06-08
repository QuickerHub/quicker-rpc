import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLlmListModelsBaseUrl,
  parseLlmModelsResponse,
} from "@/lib/llm-list-models";

describe("llm-list-models", () => {
  it("parses OpenAI-style model list", () => {
    assert.deepEqual(
      parseLlmModelsResponse({
        data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }],
      }),
      ["gpt-4o", "gpt-4o-mini"],
    );
  });

  it("parses alternate models array", () => {
    assert.deepEqual(
      parseLlmModelsResponse({
        models: ["claude-3-5-sonnet", "claude-3-haiku"],
      }),
      ["claude-3-5-sonnet", "claude-3-haiku"],
    );
  });

  it("dedupes and sorts model ids", () => {
    assert.deepEqual(
      parseLlmModelsResponse({
        data: [{ id: "z-model" }, { id: "a-model" }, { id: "z-model" }],
      }),
      ["a-model", "z-model"],
    );
  });

  it("normalizes base url trailing slash", () => {
    assert.equal(
      normalizeLlmListModelsBaseUrl("https://api.openai.com/v1/"),
      "https://api.openai.com/v1",
    );
  });
});
