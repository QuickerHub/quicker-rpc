import type { ActionScopeHint } from "@/lib/action-scope";
import type { AgentUIMessage } from "@/lib/chat-types";
import type { ChatMode } from "@/lib/chat-mode";
import {
  buildAgentTurnState,
  type AgentTurnIntent,
  type AgentTurnRisk,
} from "@/lib/agent-turn-state";
import {
  chooseRecoveryDecision,
  type AgentRecoveryDecision,
} from "@/lib/agent-recovery-policy";
import {
  collectRecentToolFeedback,
  formatRecentToolFeedbackForPrompt,
} from "@/lib/tool-feedback-context";
import { formatLocalToolResult, type ToolFeedback } from "@/lib/tool-result";

export type AgentRuntimeEvalScenario = {
  id: string;
  label: string;
  chatMode: ChatMode;
  userText: string;
  enabledToolIds: string[];
  actionScope?: ActionScopeHint;
  priorToolFeedback?: ToolFeedback;
  expect: {
    intent: AgentTurnIntent;
    risk: AgentTurnRisk;
    recommendedTools: string[];
    feedbackContains?: string[];
    recovery?: {
      kind: AgentRecoveryDecision["kind"];
      tool?: string;
    };
  };
};

export type AgentRuntimeEvalResult = {
  scenarioId: string;
  passed: boolean;
  failures: string[];
};

const EMPTY_SCOPE: ActionScopeHint = {
  pinnedLatest: undefined,
  pinnedLatestAll: [],
};

function messagesFromFeedback(feedback?: ToolFeedback): AgentUIMessage[] {
  if (!feedback) return [];
  return [
    {
      id: "runtime-eval-assistant",
      role: "assistant",
      parts: [
        {
          type: "tool-workspace_program",
          toolCallId: "runtime-eval-tool",
          state: "output-available",
          input: {},
          output: formatLocalToolResult(
            { action: "runtime-eval" },
            true,
            undefined,
            feedback,
          ),
        },
      ],
    } as AgentUIMessage,
  ];
}

export const AGENT_RUNTIME_EVAL_SCENARIOS: AgentRuntimeEvalScenario[] = [
  {
    id: "existing-v1-source-validation",
    label: "Existing V1 actions should validate YAML before saving the original action",
    chatMode: "agent",
    userText: "帮我修改动作步骤，这是已有 V1 动作，先校验源码再保存到原动作",
    enabledToolIds: [
      "docs",
      "qkrpc_action_query",
      "qkrpc_action_get",
      "qkrpc_action_open",
      "qkrpc_action_save",
      "Read",
      "StrReplace",
      "Write",
      "qkrpc_step_runner_search",
      "qkrpc_step_runner_get",
      "Shell",
    ],
    priorToolFeedback: {
      summary: "V1 YAML validation passed without writing the action or updating its baseline.",
      retryable: false,
      nextActions: [
        {
          tool: "qkrpc_action_save",
          reason: "Save the validated changes to the original V1 action.",
          priority: "recommended",
          input: { dir: ".tmp/quicker/runtime-eval-action", dryRun: false },
        },
      ],
    },
    expect: {
      intent: "action_authoring",
      risk: "write",
      recommendedTools: [
        "qkrpc_step_runner_search",
        "qkrpc_step_runner_get",
        "qkrpc_action_open",
        "qkrpc_action_save",
      ],
      feedbackContains: [
        "Recent tool feedback",
        ".tmp/quicker/runtime-eval-action",
        '"dryRun":false',
      ],
      recovery: { kind: "next_action", tool: "qkrpc_action_save" },
    },
  },
  {
    id: "authoring-patch-diagnostics",
    label: "New actions should retain create, program patch and diagnostics tools",
    chatMode: "agent",
    userText: "新建动作：获取当前时间并显示出来，保存后检查有没有语法错误",
    enabledToolIds: [
      "docs",
      "qkrpc_action_query",
      "qkrpc_action_get",
      "qkrpc_action_create",
      "qkrpc_action_debug",
      "workspace_program",
      "qkrpc_step_runner_search",
      "qkrpc_step_runner_get",
      "Shell",
    ],
    priorToolFeedback: {
      summary: "Program patch saved; diagnostics should be checked.",
      nextActions: [
        {
          tool: "workspace_program",
          reason: "Verify syntax after patch.",
          priority: "recommended",
          input: { action: "diagnostics", waitMs: 30000 },
        },
      ],
    },
    expect: {
      intent: "action_authoring",
      risk: "write",
      recommendedTools: [
        "qkrpc_step_runner_search",
        "qkrpc_step_runner_get",
        "qkrpc_action_create",
        "workspace_program",
        "qkrpc_action_debug",
      ],
      feedbackContains: ["Recent tool feedback", "diagnostics", "waitMs"],
      recovery: { kind: "next_action", tool: "workspace_program" },
    },
  },
  {
    id: "runtime-debug",
    label: "Runtime failures should prefer debug and wait tools",
    chatMode: "agent",
    userText: "这个动作运行失败了，帮我调试一下",
    enabledToolIds: [
      "qkrpc_action_query",
      "qkrpc_action_run",
      "qkrpc_action_debug",
      "qkrpc_wait",
      "workspace_program",
    ],
    expect: {
      intent: "action_runtime",
      risk: "write",
      recommendedTools: [
        "qkrpc_action_query",
        "qkrpc_action_run",
        "qkrpc_action_debug",
        "qkrpc_wait",
      ],
    },
  },
  {
    id: "workspace-read",
    label: "Workspace questions should prefer read/search before shell",
    chatMode: "agent",
    userText: "分析这个项目的代码结构，先不要修改文件",
    enabledToolIds: ["Grep", "Read", "Shell", "Write", "StrReplace"],
    expect: {
      intent: "workspace",
      risk: "read",
      recommendedTools: ["Grep", "Read", "StrReplace", "Write", "Shell"],
    },
  },
  {
    id: "user-decision-before-move",
    label: "User decisions should block automatic recovery actions",
    chatMode: "agent",
    userText: "把这个动作移动到第一页",
    enabledToolIds: ["qkrpc_action_move", "ask_question"],
    priorToolFeedback: {
      summary: "Destination slot is occupied.",
      userDecisionRequired: true,
      nextActions: [
        {
          tool: "qkrpc_action_move",
          reason: "Swap with the occupied slot.",
          priority: "recommended",
        },
      ],
    },
    expect: {
      intent: "conversation",
      risk: "write",
      recommendedTools: ["ask_question"],
      feedbackContains: ["needs user decision", "Destination slot is occupied"],
      recovery: { kind: "ask_user" },
    },
  },
];

export function evaluateAgentRuntimeScenario(
  scenario: AgentRuntimeEvalScenario,
): AgentRuntimeEvalResult {
  const failures: string[] = [];
  const turnState = buildAgentTurnState({
    actionScope: scenario.actionScope ?? EMPTY_SCOPE,
    chatMode: scenario.chatMode,
    enabledToolIds: scenario.enabledToolIds,
    userText: scenario.userText,
  });

  if (turnState.intent !== scenario.expect.intent) {
    failures.push(`intent ${turnState.intent} !== ${scenario.expect.intent}`);
  }
  if (turnState.risk !== scenario.expect.risk) {
    failures.push(`risk ${turnState.risk} !== ${scenario.expect.risk}`);
  }
  for (const toolId of scenario.expect.recommendedTools) {
    if (!turnState.recommendedToolIds.includes(toolId)) {
      failures.push(`missing recommended tool ${toolId}`);
    }
  }

  const feedbackBlock = formatRecentToolFeedbackForPrompt(
    collectRecentToolFeedback(messagesFromFeedback(scenario.priorToolFeedback)),
  );
  for (const fragment of scenario.expect.feedbackContains ?? []) {
    if (!feedbackBlock.includes(fragment)) {
      failures.push(`feedback missing "${fragment}"`);
    }
  }
  if (scenario.expect.recovery) {
    const decision = chooseRecoveryDecision(
      collectRecentToolFeedback(messagesFromFeedback(scenario.priorToolFeedback)),
    );
    if (decision.kind !== scenario.expect.recovery.kind) {
      failures.push(
        `recovery ${decision.kind} !== ${scenario.expect.recovery.kind}`,
      );
    }
    if (
      scenario.expect.recovery.tool
      && decision.kind === "next_action"
      && decision.action.tool !== scenario.expect.recovery.tool
    ) {
      failures.push(
        `recovery tool ${decision.action.tool} !== ${scenario.expect.recovery.tool}`,
      );
    }
  }

  return {
    scenarioId: scenario.id,
    passed: failures.length === 0,
    failures,
  };
}

export function evaluateAgentRuntimeScenarios(
  scenarios: readonly AgentRuntimeEvalScenario[] = AGENT_RUNTIME_EVAL_SCENARIOS,
): AgentRuntimeEvalResult[] {
  return scenarios.map(evaluateAgentRuntimeScenario);
}
