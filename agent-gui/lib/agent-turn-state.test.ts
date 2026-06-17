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
  assert.deepEqual(state.recommendedToolIds, ["docs", "workspace_program"]);
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
