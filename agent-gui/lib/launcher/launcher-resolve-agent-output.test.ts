import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatLauncherResolveForAgent,
  isLauncherResolveDirectEligible,
} from "./launcher-resolve-agent-output.ts";
import type { LauncherResolveCandidate } from "./launcher-resolve-presets.ts";

const hotkeys: LauncherResolveCandidate = {
  kind: "settings-intent",
  score: 1030,
  title: "FunctionHotkeys",
  suggestedTool: "quicker_settings",
  suggestedInput: { action: "open", page: "FunctionHotkeys" },
};

const presetAlt: LauncherResolveCandidate = {
  kind: "settings-preset",
  score: 945,
  title: "功能快捷键",
  suggestedTool: "quicker_settings",
  suggestedInput: { action: "open", preset: "hotkeys" },
};

describe("formatLauncherResolveForAgent", () => {
  it("returns compact next step without RPC envelope", () => {
    const out = formatLauncherResolveForAgent("功能快捷键", [hotkeys, presetAlt]);
    assert.equal(out.ok, true);
    assert.deepEqual(out.next, {
      tool: "quicker_settings",
      input: { action: "open", page: "FunctionHotkeys" },
    });
    assert.ok(out.alternatives && out.alternatives.length >= 1);
    assert.equal("data" in out, false);
    assert.equal("candidates" in out, false);
  });

  it("omits alternatives when top score is clearly ahead", () => {
    const farSecond = { ...presetAlt, score: 700 };
    const out = formatLauncherResolveForAgent("功能快捷键", [hotkeys, farSecond]);
    assert.equal(out.ok, true);
    assert.equal(out.alternatives, undefined);
  });
});

describe("isLauncherResolveDirectEligible", () => {
  it("allows direct when top is strong and gap is wide", () => {
    assert.equal(
      isLauncherResolveDirectEligible([hotkeys, presetAlt]),
      true,
    );
  });

  it("rejects ambiguous top two", () => {
    const close = { ...presetAlt, score: 1000 };
    assert.equal(isLauncherResolveDirectEligible([hotkeys, close]), false);
  });
});
