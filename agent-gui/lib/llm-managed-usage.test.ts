import assert from "node:assert/strict";
import test from "node:test";
import { shouldTrackManagedLlmUsage } from "@/lib/llm-managed-usage";
import { LLM_PROVIDER_ID } from "@/lib/llm-providers";

test("shouldTrackManagedLlmUsage true for default provider without user key override", () => {
  assert.equal(
    shouldTrackManagedLlmUsage({
      kind: "builtin",
      providerId: LLM_PROVIDER_ID,
    }),
    true,
  );
});

test("shouldTrackManagedLlmUsage false for custom profile selection", () => {
  assert.equal(
    shouldTrackManagedLlmUsage({
      kind: "profile",
      profileId: "p1",
      modelId: "gpt-4o-mini",
    }),
    false,
  );
});
