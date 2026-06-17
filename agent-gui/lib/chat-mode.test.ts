import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHAT_MODE_AGENT,
  CHAT_MODE_ASK,
  CHAT_MODE_LAUNCHER,
  defaultAskToolIds,
  defaultLauncherToolIds,
  maxStepsForChatMode,
  resolveChatMode,
  resolveEnabledToolsForChatMode,
} from "./chat-mode.ts";

describe("resolveChatMode", () => {
  it("defaults to agent", () => {
    assert.equal(resolveChatMode(undefined), CHAT_MODE_AGENT);
    assert.equal(resolveChatMode("invalid"), CHAT_MODE_AGENT);
  });

  it("accepts launcher", () => {
    assert.equal(resolveChatMode(CHAT_MODE_LAUNCHER), CHAT_MODE_LAUNCHER);
  });

  it("accepts ask", () => {
    assert.equal(resolveChatMode(CHAT_MODE_ASK), CHAT_MODE_ASK);
  });
});

describe("maxStepsForChatMode", () => {
  it("uses tighter limits for ask and launcher", () => {
    assert.ok(maxStepsForChatMode(CHAT_MODE_ASK) < maxStepsForChatMode(CHAT_MODE_AGENT));
    assert.ok(maxStepsForChatMode(CHAT_MODE_LAUNCHER) < maxStepsForChatMode(CHAT_MODE_AGENT));
  });
});

describe("resolveEnabledToolsForChatMode", () => {
  it("uses launcher tool set in launcher mode", () => {
    assert.deepEqual(
      resolveEnabledToolsForChatMode(
        CHAT_MODE_LAUNCHER,
        ["docs", "Shell"],
        () => ["docs"],
      ),
      defaultLauncherToolIds(),
    );
  });

  it("uses ask tool set in ask mode", () => {
    assert.deepEqual(
      resolveEnabledToolsForChatMode(
        CHAT_MODE_ASK,
        ["docs", "Shell"],
        () => ["docs"],
      ),
      defaultAskToolIds(),
    );
  });

  it("keeps custom tools in agent mode", () => {
    assert.deepEqual(
      resolveEnabledToolsForChatMode(
        CHAT_MODE_AGENT,
        ["docs", "Shell"],
        () => ["docs"],
      ),
      ["docs", "Shell"],
    );
  });

  it("falls back in agent mode", () => {
    assert.deepEqual(
      resolveEnabledToolsForChatMode(
        CHAT_MODE_AGENT,
        undefined,
        () => ["docs"],
      ),
      ["docs"],
    );
  });
});
