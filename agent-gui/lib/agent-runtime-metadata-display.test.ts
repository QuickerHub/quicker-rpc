import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildAgentRuntimeMetadataDisplay,
  buildAgentRuntimeMetadataExport,
} from "./agent-runtime-metadata-display.ts";

test("buildAgentRuntimeMetadataDisplay formats runtime metadata", () => {
  const display = buildAgentRuntimeMetadataDisplay({
    agentTurnState: {
      intent: "action_authoring",
      risk: "write",
      targetRefs: [],
      recommendedToolIds: ["docs", "workspace_program"],
      verificationHints: [],
    },
    recoveryDecision: {
      kind: "next_action",
      sourceTool: "workspace_program",
      action: {
        tool: "workspace_program",
        reason: "Run diagnostics",
        priority: "recommended",
        input: { action: "diagnostics" },
      },
    },
    recentToolFeedbackCount: 1,
  });

  assert.equal(display?.intent, "action_authoring");
  assert.equal(display?.risk, "write");
  assert.equal(display?.recovery, "workspace_program:diagnostics");
  assert.equal(display?.feedbackCount, 1);
  assert.deepEqual(display?.recommendedTools, ["docs", "workspace_program"]);
  assert.deepEqual(JSON.parse(display!.exportJson), {
    feedbackCount: 1,
    recoveryDecision: {
      kind: "next_action",
      sourceTool: "workspace_program",
      action: {
        tool: "workspace_program",
        reason: "Run diagnostics",
        priority: "recommended",
        input: { action: "diagnostics" },
      },
    },
    turnState: {
      intent: "action_authoring",
      recommendedToolIds: ["docs", "workspace_program"],
      risk: "write",
      targetRefs: [],
      verificationHints: [],
    },
  });
});

test("buildAgentRuntimeMetadataDisplay formats ask-user recovery", () => {
  const display = buildAgentRuntimeMetadataDisplay({
    recoveryDecision: {
      kind: "ask_user",
      sourceTool: "qkrpc_action_move",
      reason: "Destination slot is occupied.",
    },
  });

  assert.equal(display?.recovery, "ask_user: qkrpc_action_move");
});

test("buildAgentRuntimeMetadataDisplay omits empty metadata", () => {
  assert.equal(buildAgentRuntimeMetadataDisplay({}), null);
  assert.equal(buildAgentRuntimeMetadataDisplay(undefined), null);
  assert.equal(buildAgentRuntimeMetadataExport({}), null);
});

test("buildAgentRuntimeMetadataExport records none recovery when only feedback exists", () => {
  assert.deepEqual(
    buildAgentRuntimeMetadataExport({
      recentToolFeedbackCount: 2,
    }),
    {
      feedbackCount: 2,
      recoveryDecision: { kind: "none" },
      turnState: null,
    },
  );
});
