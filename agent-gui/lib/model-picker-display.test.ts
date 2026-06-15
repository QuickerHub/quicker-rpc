import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatModelTriggerShortLabel,
  getModelPickerTriggerDisplay,
  shouldShowModelPickerTriggerShortModel,
} from "@/lib/model-picker-display";
import { DEEPSEEK_PROVIDER_ID, LLM_PROVIDER_ID } from "@/lib/llm-providers";

describe("formatModelTriggerShortLabel", () => {
  it("shortens DeepSeek model ids", () => {
    assert.equal(formatModelTriggerShortLabel("deepseek-v4-flash"), "V4 Flash");
    assert.equal(formatModelTriggerShortLabel("deepseek-v4-pro"), "V4 Pro");
  });

  it("shortens GPT model ids", () => {
    assert.equal(formatModelTriggerShortLabel("gpt-5.5"), "GPT-5.5");
  });
});

describe("getModelPickerTriggerDisplay", () => {
  it("uses provider label + short model for builtin DeepSeek", () => {
    assert.deepEqual(
      getModelPickerTriggerDisplay({
        kind: "builtin",
        providerId: DEEPSEEK_PROVIDER_ID,
        modelId: "deepseek-v4-flash",
        label: "DeepSeek",
      }),
      { title: "DeepSeek", shortModel: "V4 Flash" },
    );
  });

  it("uses provider label + short model for builtin OpenAI", () => {
    assert.deepEqual(
      getModelPickerTriggerDisplay({
        kind: "builtin",
        providerId: LLM_PROVIDER_ID,
        modelId: "gpt-5.5",
        label: "OpenAI",
      }),
      { title: "OpenAI", shortModel: "GPT-5.5" },
    );
  });

  it("uses profile title with short model suffix", () => {
    const display = getModelPickerTriggerDisplay({
      kind: "profile",
      modelId: "deepseek-v4-flash",
      label: "未命名配置",
      profileTitle: "deepseek",
    });
    assert.equal(display.title, "deepseek");
    assert.equal(display.shortModel, "V4 Flash");
    assert.equal(shouldShowModelPickerTriggerShortModel(display), true);
  });
});
