import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHAT_MODE_AGENT,
  CHAT_MODE_LAUNCHER,
  defaultLauncherToolIds,
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
});

describe("resolveEnabledToolsForChatMode", () => {
  it("uses launcher tool set in launcher mode", () => {
    assert.deepEqual(
      resolveEnabledToolsForChatMode(
        CHAT_MODE_LAUNCHER,
        ["docs", "shell_exec"],
        () => ["docs"],
      ),
      defaultLauncherToolIds(),
    );
  });

  it("keeps custom tools in agent mode", () => {
    assert.deepEqual(
      resolveEnabledToolsForChatMode(
        CHAT_MODE_AGENT,
        ["docs", "shell_exec"],
        () => ["docs"],
      ),
      ["docs", "shell_exec"],
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
