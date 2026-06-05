import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LLM_AUTO_DEFAULT_MODEL_ID,
  resolveAutoLlmEndpoint,
} from "@/lib/llm-auto";

describe("llm-auto", () => {
  it("resolves from NVIDIA_API_KEY env when group config is absent", () => {
    const previous = process.env.NVIDIA_API_KEY;
    process.env.NVIDIA_API_KEY = "nvapi-test-key";
    delete process.env.LLM_AUTO_API_KEY;

    try {
      const endpoint = resolveAutoLlmEndpoint();
      assert.ok(endpoint);
      assert.equal(endpoint.apiKey, "nvapi-test-key");
      assert.match(endpoint.baseURL, /integrate\.api\.nvidia\.com/);
      assert.equal(endpoint.modelId, LLM_AUTO_DEFAULT_MODEL_ID);
    } finally {
      if (previous === undefined) {
        delete process.env.NVIDIA_API_KEY;
      } else {
        process.env.NVIDIA_API_KEY = previous;
      }
    }
  });
});
