import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import type { AgentUIMessage } from "@/lib/chat-types";
import { buildAgentRuntimeSnapshot } from "./agent-runtime-snapshot.ts";
import { formatLocalToolResult } from "./tool-result.ts";

const emptyScope = {
  pinnedLatest: undefined,
  pinnedLatestAll: [],
};

function feedbackMessage(): AgentUIMessage {
  return {
    id: randomUUID(),
    role: "assistant",
    parts: [
      {
        type: "tool-workspace_program",
        toolCallId: randomUUID(),
        state: "output-available",
        input: {},
        output: formatLocalToolResult(
          { action: "program-patch" },
          true,
          undefined,
          {
            summary: "Program patch saved.",
            nextActions: [
              {
                tool: "workspace_program",
                reason: "Run diagnostics.",
                priority: "recommended",
                input: { action: "diagnostics" },
              },
            ],
          },
        ),
      },
    ],
  } as AgentUIMessage;
}

test("buildAgentRuntimeSnapshot captures turn state and recovery decision", () => {
  const snapshot = buildAgentRuntimeSnapshot({
    actionScope: emptyScope,
    chatMode: "agent",
    enabledToolIds: ["docs", "workspace_program"],
    messages: [feedbackMessage()],
    userText: "帮我修改动作步骤并保存",
  });

  assert.equal(snapshot.turnState.intent, "action_authoring");
  assert.equal(snapshot.turnState.risk, "write");
  assert.deepEqual(snapshot.turnState.recommendedToolIds, ["docs", "workspace_program"]);
  assert.equal(snapshot.recentToolFeedbackCount, 1);
  assert.equal(snapshot.recoveryDecision.kind, "next_action");
  assert.equal(
    snapshot.recoveryDecision.kind === "next_action"
      && snapshot.recoveryDecision.action.input?.action,
    "diagnostics",
  );
});

test("buildAgentRuntimeSnapshot reports none without tool feedback", () => {
  const snapshot = buildAgentRuntimeSnapshot({
    actionScope: emptyScope,
    chatMode: "agent",
    enabledToolIds: ["Grep", "Read"],
    messages: [],
    userText: "只读分析代码结构",
  });

  assert.equal(snapshot.turnState.risk, "read");
  assert.equal(snapshot.recentToolFeedbackCount, 0);
  assert.equal(snapshot.recoveryDecision.kind, "none");
});
