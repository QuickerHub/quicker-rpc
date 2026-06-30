import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import type { AgentUIMessage } from "@/lib/chat-types";
import { formatLocalToolResult } from "@/lib/tool-result";
import { resolveTurnPlan } from "./turn-plan.ts";

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
                priority: "required",
                input: { action: "diagnostics" },
              },
            ],
          },
        ),
      },
    ],
  } as AgentUIMessage;
}

test("resolveTurnPlan maps action authoring to qkrpc authoring capabilities", () => {
  const plan = resolveTurnPlan({
    actionScope: emptyScope,
    chatMode: "agent",
    enabledToolIds: [
      "docs",
      "workspace_program",
      "qkrpc_step_runner_search",
      "qkrpc_step_runner_get",
      "qkrpc_action_debug",
    ],
    messages: [],
    userText: "创建动作并编辑步骤",
  });

  assert.equal(plan.intent, "quicker_authoring");
  assert.equal(plan.risk, "write");
  assert.ok(plan.capabilityBundles.includes("qkrpc.authoring"));
  assert.ok(plan.capabilityBundles.includes("qkrpc.runtime"));
  assert.ok(plan.fullSchemaToolIds.includes("workspace_program"));
  assert.equal(plan.fullSchemaToolIds.includes("Shell"), false);
  assert.equal(plan.verificationPolicy, "diagnostics");
});

test("resolveTurnPlan keeps ask mode read-only with explain-only verification", () => {
  const plan = resolveTurnPlan({
    actionScope: emptyScope,
    chatMode: "ask",
    enabledToolIds: ["Read", "Grep", "workspace_program"],
    messages: [],
    userText: "只读分析这个动作",
  });

  assert.equal(plan.mode, "ask");
  assert.equal(plan.intent, "conversation");
  assert.equal(plan.risk, "read");
  assert.equal(plan.verificationPolicy, "explain_only");
  assert.ok(plan.blockedToolIds.includes("workspace_program"));
});

test("resolveTurnPlan maps launcher mode to qkrpc runtime", () => {
  const plan = resolveTurnPlan({
    actionScope: emptyScope,
    chatMode: "launcher",
    enabledToolIds: ["qkrpc_action_query", "qkrpc_action_run", "launcher_resolve"],
    messages: [],
    userText: "运行截图动作",
  });

  assert.equal(plan.mode, "launcher");
  assert.equal(plan.intent, "quicker_runtime");
  assert.equal(plan.risk, "write");
  assert.ok(plan.capabilityBundles.includes("qkrpc.runtime"));
});

test("resolveTurnPlan promotes required recovery nextAction to required tools", () => {
  const plan = resolveTurnPlan({
    actionScope: emptyScope,
    chatMode: "agent",
    enabledToolIds: ["docs", "workspace_program"],
    messages: [feedbackMessage()],
    userText: "继续",
  });

  assert.equal(plan.nextAction?.tool, "workspace_program");
  assert.ok(plan.requiredToolIds.includes("workspace_program"));
  assert.equal(plan.verificationPolicy, "diagnostics");
});
