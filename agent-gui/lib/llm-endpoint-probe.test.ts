import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hostFromLlmBaseUrl,
  maskLlmApiKey,
  parseLlmProbeConfigSource,
  parseLlmProbeMethod,
  formatLlmEndpointProbeFullMessage,
} from "@/lib/llm-endpoint-probe-core";

describe("llm-endpoint-probe helpers", () => {
  it("masks api keys", () => {
    assert.equal(maskLlmApiKey("sk-abcdef1234567890"), "sk-a…7890");
    assert.equal(maskLlmApiKey(""), "***");
  });

  it("parses host from base url", () => {
    assert.equal(
      hostFromLlmBaseUrl("https://integrate.api.nvidia.com/v1"),
      "integrate.api.nvidia.com",
    );
  });

  it("parses probe source and method", () => {
    assert.equal(parseLlmProbeConfigSource("publish"), "publish");
    assert.equal(parseLlmProbeConfigSource(undefined), "all");
    assert.equal(parseLlmProbeMethod("chat"), "chat");
    assert.equal(parseLlmProbeMethod("full"), "full");
    assert.equal(parseLlmProbeMethod("models"), "models");
  });

  it("formats full probe message", () => {
    assert.equal(
      formatLlmEndpointProbeFullMessage(
        { ok: true, latencyMs: 100, message: "10 models" },
        { ok: false, latencyMs: 500, status: 502, message: "HTTP 502" },
      ),
      "models: 10 models | chat: HTTP 502",
    );
  });
});
