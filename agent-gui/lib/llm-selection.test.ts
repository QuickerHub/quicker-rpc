import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatLlmSelection,
  parseLlmSelection,
  profileSelection,
} from "@/lib/llm-selection";
import { normalizeProfiles } from "@/lib/llm-profile-schema";

describe("llm-selection", () => {
  it("round-trips builtin provider ids", () => {
    const selection = { kind: "builtin" as const, providerId: "deepseek" as const };
    assert.equal(formatLlmSelection(selection), "deepseek");
    assert.deepEqual(parseLlmSelection("deepseek"), selection);
  });

  it("round-trips auto selection", () => {
    const selection = { kind: "auto" as const };
    assert.equal(formatLlmSelection(selection), "auto");
    assert.deepEqual(parseLlmSelection("auto"), selection);
  });

  it("round-trips profile selections", () => {
    const selection = profileSelection("abc-123", "gpt-4o/mini");
    const encoded = formatLlmSelection(selection);
    assert.equal(encoded, "profile:abc-123/gpt-4o%2Fmini");
    assert.deepEqual(parseLlmSelection(encoded), selection);
  });
});

describe("normalizeProfiles", () => {
  it("dedupes models and picks default", () => {
    const profiles = normalizeProfiles([
      {
        id: "p1",
        title: "Proxy",
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        models: ["gpt-4o", "gpt-4o", "gpt-4o-mini"],
        defaultModel: "gpt-4o-mini",
      },
    ]);
    assert.equal(profiles.length, 1);
    assert.deepEqual(profiles[0]?.models, ["gpt-4o", "gpt-4o-mini"]);
    assert.equal(profiles[0]?.defaultModel, "gpt-4o-mini");
  });
});
