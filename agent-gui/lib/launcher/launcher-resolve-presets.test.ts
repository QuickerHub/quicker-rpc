import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyLauncherResolvePresets,
  type LauncherResolveCandidate,
} from "./launcher-resolve-presets.ts";

test("applyLauncherResolvePresets boosts settings when query mentions 设置", () => {
  const candidates: LauncherResolveCandidate[] = [
    { kind: "action", score: 500, title: "某动作" },
    { kind: "settings-intent", score: 480, title: "功能快捷键" },
  ];
  const ranked = applyLauncherResolvePresets("打开功能快捷键设置", candidates);
  assert.equal(ranked[0]?.kind, "settings-intent");
  assert.ok((ranked[0]?.presetBoost ?? 0) > 0);
});

test("applyLauncherResolvePresets boosts action when query mentions 运行", () => {
  const candidates: LauncherResolveCandidate[] = [
    { kind: "settings-page", score: 800, title: "设置页" },
    { kind: "action", score: 780, title: "剪贴板" },
  ];
  const ranked = applyLauncherResolvePresets("运行剪贴板", candidates);
  assert.equal(ranked[0]?.kind, "action");
});
