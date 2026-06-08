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
  matchedQueryTerm: "功能快捷键",
  matchedOn: "title: FunctionHotkeys",
};

const presetAlt: LauncherResolveCandidate = {
  kind: "settings-preset",
  score: 945,
  title: "功能快捷键",
  suggestedTool: "quicker_settings",
  suggestedInput: { action: "open", preset: "hotkeys" },
  matchedQueryTerm: "功能快捷键",
  matchedOn: "title: 功能快捷键",
};

describe("formatLauncherResolveForAgent", () => {
  it("returns compact next step without RPC envelope", () => {
    const out = formatLauncherResolveForAgent("功能快捷键", [hotkeys, presetAlt]);
    assert.equal(out.ok, true);
    assert.deepEqual(out.next?.tool, "quicker_settings");
    assert.deepEqual(out.next?.input, { action: "open", page: "FunctionHotkeys" });
    assert.deepEqual(out.next?.match, {
      term: "功能快捷键",
      on: "title: FunctionHotkeys",
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

  it("omits next when resolve is not direct-eligible", () => {
    const action = {
      kind: "action",
      score: 520,
      title: "Clipboard Dedup & Sort",
      suggestedTool: "qkrpc_action_run",
      suggestedInput: { id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" },
      matchedQueryTerm: "clipboard",
      matchedOn: "title: Clipboard Dedup & Sort",
    };
    const out = formatLauncherResolveForAgent("clipboard|剪贴板", [action]);
    assert.equal(out.ok, true);
    assert.equal(out.next, undefined);
    assert.equal(out.disambiguationRequired, true);
    assert.ok(out.ranked?.length === 1);
  });

  it("includes queryTerms, missedTerms, and match attribution", () => {
    const out = formatLauncherResolveForAgent(
      "动作管理器|搜索动作",
      [hotkeys],
      { queryTerms: ["动作管理器", "搜索动作"], missedTerms: ["动作管理器"] },
    );
    assert.deepEqual(out.queryTerms, ["动作管理器", "搜索动作"]);
    assert.deepEqual(out.missedTerms, ["动作管理器"]);
    assert.equal(out.next?.match?.term, "功能快捷键");
    assert.ok(out.ranked?.length === 1);
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
