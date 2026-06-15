import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateLauncherExpect } from "@/lib/agent-eval/launcher-expect";

describe("agent-eval launcher-expect", () => {
  it("passes cache-direct quicker_settings for hotkeys", () => {
    const result = evaluateLauncherExpect(
      [
        {
          toolName: "quicker_settings",
          state: "output-available",
          input: { action: "open", page: "FunctionHotkeys" },
        },
      ],
      {
        intent: "open-settings",
        settingsOpen: { page: "FunctionHotkeys" },
      },
    );
    assert.equal(result.passed, true);
  });

  it("passes LLM path with launcher_resolve then quicker_settings", () => {
    const result = evaluateLauncherExpect(
      [
        {
          toolName: "launcher_resolve",
          state: "output-available",
        },
        {
          toolName: "quicker_settings",
          state: "output-available",
          input: { action: "open", preset: "hotkeys" },
        },
      ],
      {
        intent: "open-settings",
        settingsOpen: { page: "FunctionHotkeys" },
      },
    );
    assert.equal(result.passed, true);
  });

  it("passes recycle-bin via preset alias", () => {
    const result = evaluateLauncherExpect(
      [
        {
          toolName: "quicker_settings",
          state: "output-available",
          input: { action: "open", preset: "recycle-bin" },
        },
      ],
      {
        intent: "open-settings",
        settingsOpen: { page: "recycle-bin" },
      },
    );
    assert.equal(result.passed, true);
  });

  it("passes run-action via launcher_resolve only", () => {
    const result = evaluateLauncherExpect(
      [{ toolName: "launcher_resolve", state: "output-available" }],
      { intent: "run-action" },
    );
    assert.equal(result.passed, true);
  });

  it("fails when settings open target is wrong", () => {
    const result = evaluateLauncherExpect(
      [
        {
          toolName: "quicker_settings",
          state: "output-available",
          input: { action: "open", page: "BasicInfo" },
        },
      ],
      {
        intent: "open-settings",
        settingsOpen: { page: "FunctionHotkeys" },
      },
    );
    assert.equal(result.passed, false);
    assert.ok(result.violations[0]?.includes("FunctionHotkeys"));
  });
});
