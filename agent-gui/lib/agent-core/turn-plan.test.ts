import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { tool, type ToolExecutionOptions } from "ai";
import { z } from "zod";

import type { AgentUIMessage } from "@/lib/chat-types";
import { formatLocalToolResult } from "@/lib/tool-result";
import { resolveTurnPlan } from "./turn-plan.ts";
import { formatActionSourceToolResult } from "@/lib/qkrpc-action-source-tool";
import { applyToolModeGuards } from "@/lib/agent-tool-mode-guard";
import { buildAgentRuntimeSnapshot } from "@/lib/agent-runtime-snapshot";
import { isStructuredToolResult } from "@/lib/tool-result";

const emptyScope = {
  pinnedLatest: undefined,
  pinnedLatestAll: [],
};

test("source validation feedback continues through the existing TurnPlan and permissions", () => {
  const dir = ".tmp/quicker/source";
  const output = formatActionSourceToolResult("save", { dir, dryRun: true }, {
    ...formatLocalToolResult({ ok: true, dryRun: true, actionId: "fixture", editVersion: 7 }),
    source: "qkrpc",
  });
  const messages = [{
    id: randomUUID(), role: "assistant", parts: [{
      type: "tool-qkrpc_action_save", toolCallId: randomUUID(), state: "output-available",
      input: { dir, dryRun: true }, output,
    }],
  }] as AgentUIMessage[];
  const plan = resolveTurnPlan({
    actionScope: emptyScope, chatMode: "agent", messages,
    enabledToolIds: ["qkrpc_action_open", "qkrpc_action_save", "Read", "StrReplace"],
    userText: "修改动作的 program.source.yaml 并保存",
  });
  assert.equal(plan.intent, "quicker_authoring");
  assert.ok(plan.fullSchemaToolIds.includes("qkrpc_action_open"));
  assert.ok(plan.fullSchemaToolIds.includes("qkrpc_action_save"));
  assert.ok(plan.requiredToolIds.includes("qkrpc_action_open"));
  assert.equal(plan.nextAction?.tool, "qkrpc_action_save");
  assert.deepEqual(plan.nextAction?.input, { dir, dryRun: false });
  assert.ok(plan.systemHints.some((hint) => hint.includes("baseline.json")));
  const ask = resolveTurnPlan({
    actionScope: emptyScope, chatMode: "ask", messages: [],
    enabledToolIds: ["qkrpc_action_open", "qkrpc_action_save"], userText: "修改动作",
  });
  assert.ok(ask.blockedToolIds.includes("qkrpc_action_open"));
  assert.ok(ask.blockedToolIds.includes("qkrpc_action_save"));
});

function feedbackMessage(action = "diagnostics"): AgentUIMessage {
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
                input: { action },
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

test("recovery planning and final execution share operation constraints without erasing unmet requirements", async () => {
  const cases = [
    { mode: "ask", action: "diagnostics", enabled: true, readPort: true, allowed: false },
    { mode: "agent", action: "diagnostics", enabled: true, readPort: false, allowed: true },
    { mode: "ask", action: "read_data", enabled: true, readPort: true, allowed: true },
    { mode: "ask", action: "read_data", enabled: true, readPort: false, allowed: false },
    { mode: "ask", action: "future_action", enabled: true, readPort: true, allowed: false },
    { mode: "agent", action: "diagnostics", enabled: false, readPort: false, allowed: false },
  ] as const;
  for (const row of cases) {
    let baseCalls = 0, readCalls = 0;
    const workspace = tool({ inputSchema: z.object({ action: z.string() }), execute: async ({ action }) => {
      baseCalls++; return formatLocalToolResult({ action });
    } });
    const readOnly = async (input: unknown) => { readCalls++; return formatLocalToolResult({ action: (input as { action: string }).action }); };
    const definitions = row.enabled ? { workspace_program: workspace } : {};
    const ports = row.readPort ? { workspace_program: readOnly } : {};
    const tools = applyToolModeGuards(definitions, row.mode, ports);
    const messages = [feedbackMessage(row.action)];
    const original = JSON.stringify(messages);
    const plan = resolveTurnPlan({
      actionScope: emptyScope, chatMode: row.mode, enabledToolIds: Object.keys(tools),
      readOnlyExecutorToolIds: Object.keys(ports), messages, userText: "继续",
    });
    assert.ok(plan.requiredToolIds.includes("workspace_program"));
    if (row.allowed) {
      assert.equal(plan.nextAction?.input?.action, row.action);
      assert.equal(plan.blockedNextAction, undefined);
      assert.equal(plan.blockedToolIds.includes("workspace_program"), false);
    } else {
      assert.equal(plan.nextAction, undefined);
      assert.deepEqual(plan.blockedNextAction?.action.input, { action: row.action });
      assert.ok(plan.blockedNextAction?.reason);
      assert.equal(plan.recoveryDecision.kind, "ask_user");
      assert.equal(plan.verificationPolicy, "ask_user");
      assert.match(plan.recoveryDecision.kind === "ask_user" ? plan.recoveryDecision.reason : "", /incomplete/);
    }
    if (row.enabled) {
      const result = await tools.workspace_program!.execute!({ action: row.action }, { toolCallId: "plan-parity", messages: [] } as ToolExecutionOptions);
      assert.ok(isStructuredToolResult(result));
      assert.equal(result.ok, row.allowed);
    }
    assert.equal(baseCalls, row.allowed && row.mode === "agent" ? 1 : 0);
    assert.equal(readCalls, row.allowed && row.mode === "ask" ? 1 : 0);
    assert.equal(JSON.stringify(messages), original, "history keeps the original unmet requirement");
    const snapshot = buildAgentRuntimeSnapshot({
      actionScope: emptyScope, chatMode: row.mode, enabledToolIds: Object.keys(tools), messages,
      userText: "different text", turnPlan: plan,
    });
    assert.equal(snapshot.turnPlan, plan);
    assert.equal(snapshot.recoveryDecision, plan.recoveryDecision, "snapshot projects the same decision rather than reselecting feedback");
  }
});
