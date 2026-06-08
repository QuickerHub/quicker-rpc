import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkLauncherActionRunAllowed,
  isLauncherVagueRunIntent,
  shouldBlockLauncherActionQueryAutoRun,
} from "./launcher-action-run-guard.ts";

describe("isLauncherVagueRunIntent", () => {
  it("detects category-level run phrasing", () => {
    assert.equal(isLauncherVagueRunIntent("运行剪贴板相关动作"), true);
    assert.equal(isLauncherVagueRunIntent("run something related to clipboard"), true);
  });

  it("allows explicit action title mentions", () => {
    assert.equal(
      isLauncherVagueRunIntent("运行 Clipboard Dedup & Sort"),
      false,
    );
  });

  it("allows qka mentions", () => {
    assert.equal(
      isLauncherVagueRunIntent(
        '运行 <qka id="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee">Test</qka>',
      ),
      false,
    );
  });
});

describe("checkLauncherActionRunAllowed", () => {
  const actionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  it("blocks vague launcher runs without explicit pick", () => {
    const result = checkLauncherActionRunAllowed({
      chatMode: "launcher",
      userText: "运行剪贴板相关动作",
      actionId,
      actionTitle: "Clipboard Dedup & Sort",
    });
    assert.equal(result.allowed, false);
  });

  it("allows launcher run when user names the action", () => {
    const result = checkLauncherActionRunAllowed({
      chatMode: "launcher",
      userText: "运行 Clipboard Dedup & Sort",
      actionId,
      actionTitle: "Clipboard Dedup & Sort",
    });
    assert.equal(result.allowed, true);
  });

  it("allows agent mode without guard", () => {
    const result = checkLauncherActionRunAllowed({
      chatMode: "agent",
      userText: "运行剪贴板相关动作",
      actionId,
    });
    assert.equal(result.allowed, true);
  });
});

describe("shouldBlockLauncherActionQueryAutoRun", () => {
  it("blocks vague query follow-up in launcher", () => {
    const result = shouldBlockLauncherActionQueryAutoRun({
      chatMode: "launcher",
      userText: "运行剪贴板相关动作",
      matchCount: 1,
    });
    assert.equal(result.blocked, true);
  });
});
