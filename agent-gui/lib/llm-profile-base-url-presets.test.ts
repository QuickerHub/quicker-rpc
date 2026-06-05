import assert from "node:assert/strict";
import test from "node:test";
import {
  findBaseUrlPreset,
  normalizeBaseUrlForMatch,
} from "@/lib/llm-profile-base-url-presets";

test("findBaseUrlPreset ignores trailing slash", () => {
  const preset = findBaseUrlPreset("https://api.openai.com/v1/");
  assert.equal(preset?.id, "openai");
});

test("normalizeBaseUrlForMatch trims whitespace", () => {
  assert.equal(
    normalizeBaseUrlForMatch("  https://api.deepseek.com/v1/  "),
    "https://api.deepseek.com/v1",
  );
});
