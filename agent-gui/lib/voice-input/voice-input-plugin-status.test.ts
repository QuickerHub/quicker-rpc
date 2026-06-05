import assert from "node:assert/strict";
import test from "node:test";
import {
  canUseVoiceInput,
  voicePluginStatusLabel,
} from "./voice-input-plugin-status.ts";

test("canUseVoiceInput only when running", () => {
  assert.equal(canUseVoiceInput("running"), true);
  assert.equal(canUseVoiceInput("not_installed"), false);
  assert.equal(canUseVoiceInput("starting"), false);
});

test("voicePluginStatusLabel covers known states", () => {
  assert.equal(voicePluginStatusLabel("not_installed"), "未安装");
  assert.equal(voicePluginStatusLabel("running"), "运行中");
});
