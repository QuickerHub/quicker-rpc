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
  it("keeps an explicitly empty Agent capability selection", () => {
    assert.deepEqual(resolveEnabledToolsForChatMode(CHAT_MODE_AGENT, [], () => ["Write"]), []);
  });
  it("intersects explicit launcher selection with its mode boundary", () => {
    assert.deepEqual(
      resolveEnabledToolsForChatMode(
        CHAT_MODE_LAUNCHER,
        ["docs", "Shell"],
        () => ["docs"],
      ),
      ["docs", "Shell"],
    );
  });

  it("intersects explicit Ask selection with its read-only boundary", () => {
    assert.equal(defaultAskToolIds().includes("browser"), false);
    assert.deepEqual(
      resolveEnabledToolsForChatMode(
        CHAT_MODE_ASK,
        ["docs", "Shell"],
        () => ["docs"],
      ),
      ["docs"],
    );
  });

  for (const mode of [CHAT_MODE_AGENT, CHAT_MODE_ASK, CHAT_MODE_LAUNCHER]) {
    it(`${mode}: preserves empty selection without calling the fallback`, () => {
      assert.deepEqual(resolveEnabledToolsForChatMode(mode, [], () => { throw Error("Unexpected fallback"); }), []);
    });
  }

  it("keeps each mode default only when selection is absent", () => {
    assert.deepEqual(resolveEnabledToolsForChatMode(CHAT_MODE_ASK, undefined, () => []), defaultAskToolIds());
    assert.deepEqual(resolveEnabledToolsForChatMode(CHAT_MODE_LAUNCHER, undefined, () => []), defaultLauncherToolIds());
  });

  it("lists only local tools and explicit non-bootstrapping program getters in Ask", () => {
    assert.deepEqual(defaultAskToolIds(), [
      "docs", "ask_question", "web_search", "Read", "Grep", "workspace_program",
      "qkrpc_action_get", "qkrpc_subprogram_get",
    ]);
    // This temporary Ask boundary must not narrow the operational launcher.
    for (const id of ["qkrpc_action_query", "qkrpc_subprogram_query", "qkrpc_fa", "launcher_resolve", "quicker_settings"]) {
      assert.ok(defaultLauncherToolIds().includes(id));
    }
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
