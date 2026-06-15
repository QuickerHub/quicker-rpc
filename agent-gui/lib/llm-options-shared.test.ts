import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LLM_AUTO_SELECTION,
  formatLlmSelection,
  profileSelection,
} from "@/lib/llm-selection";
import { LLM_PROVIDER_ID } from "@/lib/llm-providers";
import {
  pickInitialLauncherLlmSelection,
  pickInitialLlmSelection,
  type LlmOptionsResponse,
} from "@/lib/llm-options-shared";

function mockOptionsResponse(
  overrides: Partial<LlmOptionsResponse> = {},
): LlmOptionsResponse {
  const gptSelection = formatLlmSelection({
    kind: "builtin",
    providerId: LLM_PROVIDER_ID,
  });
  const deepseekSelection = formatLlmSelection({
    kind: "builtin",
    providerId: "deepseek",
  });
  const profileSel = formatLlmSelection(
    profileSelection("profile-1", "gpt-4o"),
  );

  return {
    defaultSelection: gptSelection,
    activeSelection: deepseekSelection,
    directOverride: false,
    options: [
      {
        selection: LLM_AUTO_SELECTION,
        kind: "auto",
        label: "Auto",
        description: "",
        modelId: "auto",
        configured: true,
        contextLimit: 128_000,
      },
      {
        selection: gptSelection,
        kind: "builtin",
        providerId: LLM_PROVIDER_ID,
        label: "OpenAI",
        description: "",
        modelId: "gpt-5.5",
        configured: true,
        contextLimit: 128_000,
      },
      {
        selection: deepseekSelection,
        kind: "builtin",
        providerId: "deepseek",
        label: "DeepSeek",
        description: "",
        modelId: "deepseek-v4-pro",
        configured: true,
        contextLimit: 128_000,
      },
      {
        selection: profileSel,
        kind: "profile",
        profileId: "profile-1",
        profileModels: ["gpt-4o"],
        label: "Proxy",
        description: "",
        modelId: "gpt-4o",
        configured: true,
        contextLimit: 128_000,
      },
    ],
    ...overrides,
  };
}

describe("pickInitialLlmSelection", () => {
  it("prefers stored browser choice over server activeSelection", () => {
    const data = mockOptionsResponse();
    const stored = formatLlmSelection(
      profileSelection("profile-1", "gpt-4o"),
    );
    assert.equal(pickInitialLlmSelection(data, stored), stored);
  });

  it("prefers DeepSeek when nothing is stored", () => {
    const data = mockOptionsResponse();
    const expected = formatLlmSelection({
      kind: "builtin",
      providerId: "deepseek",
    });
    assert.equal(pickInitialLlmSelection(data, undefined), expected);
  });

  it("restores stored Auto selection", () => {
    const data = mockOptionsResponse();
    assert.equal(pickInitialLlmSelection(data, LLM_AUTO_SELECTION), LLM_AUTO_SELECTION);
  });

  it("does not default to Auto when DeepSeek is configured", () => {
    const data = mockOptionsResponse();
    assert.notEqual(
      pickInitialLlmSelection(data, undefined),
      LLM_AUTO_SELECTION,
    );
  });
});

describe("pickInitialLauncherLlmSelection", () => {
  it("prefers stored launcher choice", () => {
    const data = mockOptionsResponse();
    const stored = formatLlmSelection({
      kind: "builtin",
      providerId: "deepseek",
    });
    assert.equal(pickInitialLauncherLlmSelection(data, stored), stored);
  });

  it("falls back to Auto when launcher has no stored choice", () => {
    const data = mockOptionsResponse();
    assert.equal(
      pickInitialLauncherLlmSelection(data, undefined),
      LLM_AUTO_SELECTION,
    );
  });
});
