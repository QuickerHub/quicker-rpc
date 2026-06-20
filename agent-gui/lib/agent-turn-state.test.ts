import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildAgentTurnState,
  formatAgentTurnStateForPrompt,
} from "./agent-turn-state.ts";

const emptyScope = {
  pinnedLatest: undefined,
  pinnedLatestAll: [],
};

test("buildAgentTurnState identifies action authoring turns", () => {
  const state = buildAgentTurnState({
    actionScope: emptyScope,
    chatMode: "agent",
    enabledToolIds: ["docs", "workspace_program"],
    userText: "帮我修改动作步骤，然后保存",
  });

  assert.equal(state.intent, "action_authoring");
  assert.equal(state.risk, "write");
  assert.deepEqual(state.targetRefs, []);
  assert.deepEqual(state.recommendedToolIds, ["workspace_program"]);
  assert.ok(state.verificationHints.some((hint) => hint.includes("diagnostics")));
});

test("buildAgentTurnState includes pinned action targets", () => {
  const state = buildAgentTurnState({
    actionScope: {
      pinnedLatest: {
        id: "00000000-0000-0000-0000-000000000001",
        source: "user-tag",
        title: "Demo",
      },
      pinnedLatestAll: [
        {
          id: "00000000-0000-0000-0000-000000000001",
          source: "user-tag",
          title: "Demo",
        },
      ],
    },
    chatMode: "agent",
    enabledToolIds: ["qkrpc_action_run"],
    userText: "调试这个动作",
  });

  assert.equal(state.intent, "action_runtime");
  assert.deepEqual(state.recommendedToolIds, ["qkrpc_action_run"]);
  assert.deepEqual(state.targetRefs, ["00000000-0000-0000-0000-000000000001"]);
});

test("buildAgentTurnState forces read-only conversation in ask mode", () => {
  const state = buildAgentTurnState({
    actionScope: emptyScope,
    chatMode: "ask",
    enabledToolIds: ["docs", "workspace_program", "Shell"],
    userText: "帮我修改动作步骤，然后保存",
  });

  assert.equal(state.intent, "conversation");
  assert.equal(state.risk, "read");
});

test("buildAgentTurnState treats 做一个动作 as action authoring", () => {
  const state = buildAgentTurnState({
    actionScope: emptyScope,
    chatMode: "agent",
    enabledToolIds: ["docs", "workspace_program", "qkrpc_action_create"],
    userText:
      "做一个动作：读取剪贴板文本，去掉空行、按行去重、按字母序排序后写回剪贴板，并提示处理前后的行数。",
  });

  assert.equal(state.intent, "action_authoring");
  assert.equal(state.risk, "write");
  assert.ok(state.recommendedToolIds.includes("workspace_program"));
  assert.ok(state.verificationHints.some((h) => h.includes("skip read_data")));
  assert.ok(state.verificationHints.some((h) => h.includes("getClipboardText|writeClipboard")));
});

test("buildAgentTurnState treats step discovery as read-only conversation", () => {
  const prompt =
    "我想对剪贴板里的文本按行去重并排序，应该用哪种 Quicker 步骤？请查清楚后列出与表达式/输出相关的参数键名，不要猜。";
  const state = buildAgentTurnState({
    actionScope: emptyScope,
    chatMode: "agent",
    enabledToolIds: [
      "docs",
      "qkrpc_step_runner_search",
      "qkrpc_step_runner_get",
      "qkrpc_wait",
    ],
    userText: prompt,
  });

  assert.equal(state.intent, "conversation");
  assert.equal(state.risk, "read");
  assert.deepEqual(state.recommendedToolIds, [
    "qkrpc_step_runner_search",
    "qkrpc_step_runner_get",
    "qkrpc_wait",
  ]);
  assert.ok(state.verificationHints.some((h) => h.includes("qkrpc_wait")));
  assert.ok(state.verificationHints.some((h) => h.includes("Do not call docs")));
});

test("buildAgentTurnState treats 先不要 patch as read risk", () => {
  const state = buildAgentTurnState({
    actionScope: emptyScope,
    chatMode: "agent",
    enabledToolIds: ["workspace_program", "docs"],
    userText: "/author 列出当前工作区动作并说明下一步如何创建新动作（先不要 patch）",
  });

  assert.equal(state.risk, "read");
});

test("buildAgentTurnState treats multi-var with evalexpression hints", () => {
  const state = buildAgentTurnState({
    actionScope: emptyScope,
    chatMode: "agent",
    enabledToolIds: ["qkrpc_action_create", "workspace_program"],
    userText:
      "新建动作：用一个表达式步骤同时设置 a=1、b=2、c=a+b，最后用文本窗口显示 c 的值。",
  });

  assert.equal(state.intent, "action_authoring");
  assert.ok(state.verificationHints.some((h) => h.includes("programData")));
  assert.ok(state.verificationHints.some((h) => h.includes("Convert.ToDouble")));
});

test("buildAgentTurnState treats clip-lines as clipboard pipeline hints", () => {
  const state = buildAgentTurnState({
    actionScope: emptyScope,
    chatMode: "agent",
    enabledToolIds: ["workspace_program", "qkrpc_step_runner_search"],
    userText:
      "做一个动作：读取剪贴板文本，去掉空行、按行去重、按字母序排序后写回剪贴板。",
  });

  assert.equal(state.intent, "action_authoring");
  assert.ok(
    state.verificationHints.some((h) => h.includes("getClipboardText|writeClipboard")),
  );
});

test("formatAgentTurnStateForPrompt renders a compact prompt block", () => {
  const block = formatAgentTurnStateForPrompt({
    intent: "workspace",
    risk: "read",
    targetRefs: [],
    recommendedToolIds: ["Grep", "Read"],
    verificationHints: ["Use Grep before reading many files."],
  });

  assert.ok(block.includes("## Turn state"));
  assert.ok(block.includes("Intent: workspace"));
  assert.ok(block.includes("Risk: read"));
  assert.ok(block.includes("Target refs: none"));
  assert.ok(block.includes("Recommended tools: Grep, Read"));
  assert.ok(block.includes("- Use Grep before reading many files."));
});
