import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveEffectiveTurnSelection } from "./turn-selection";
import { parseLlmSelection, type LlmSelection } from "@/lib/llm-selection";
import type { LlmProviderId } from "@/lib/llm-providers";

test("slash model override is the canonical selection inherited by nested runtimes", () => {
  const calls: Array<{ raw?: string; legacy?: LlmProviderId }> = [];
  const result = resolveEffectiveTurnSelection({
    commandModelOverride: "profile:review/model%2Fselected-by-command",
    llmSelection: "profile:parent/model-from-body",
    llmProvider: "deepseek",
  }, (raw, legacy) => {
    calls.push({ raw, legacy });
    return parseLlmSelection(raw)!;
  });
  assert.deepEqual(calls, [{ raw: "profile:review/model%2Fselected-by-command", legacy: "deepseek" }]);
  assert.deepEqual(result.selection, { kind: "profile", profileId: "review", modelId: "model/selected-by-command" });
  assert.deepEqual(parseLlmSelection(result.llmSelectionRaw), result.selection);
});

test("modern, legacy, and automatic selections serialize the effective parsed value", () => {
  for (const input of [
    { llmSelection: " profile:parent/model%20with%20spaces ", llmProvider: "deepseek" },
    { llmProvider: "deepseek" },
    { llmSelection: " Auto " },
  ]) {
    let resolutions = 0;
    const result = resolveEffectiveTurnSelection(input, (raw) => {
      resolutions += 1;
      return parseLlmSelection(raw)!;
    });
    assert.equal(resolutions, 1);
    assert.deepEqual(parseLlmSelection(result.llmSelectionRaw), result.selection);
  }
});

test("an omitted input freezes one resolved fallback for the parent and child", () => {
  let resolutions = 0;
  const fallback: LlmSelection = { kind: "profile", profileId: "default", modelId: "chosen-once" };
  const result = resolveEffectiveTurnSelection({}, (raw, legacy) => {
    resolutions += 1;
    assert.equal(raw, undefined);
    assert.equal(legacy, "bingleimuzi");
    return fallback;
  });
  assert.equal(resolutions, 1);
  assert.equal(result.selection, fallback);
  assert.equal(result.llmSelectionRaw, "profile:default/chosen-once");
  assert.deepEqual(parseLlmSelection(result.llmSelectionRaw), fallback);
});
