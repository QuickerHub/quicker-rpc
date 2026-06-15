import {
  chooseRecoveryDecision,
  type AgentRecoveryDecision,
} from "@/lib/agent-recovery-policy";
import type { RecentToolFeedbackItem } from "@/lib/tool-feedback-context";
import type { ToolFeedback } from "@/lib/tool-result";

export type AgentRuntimeSequenceStep = {
  label: string;
  toolName: string;
  feedback: ToolFeedback;
  expect: {
    decision: AgentRecoveryDecision["kind"];
    tool?: string;
    action?: string;
  };
};

export type AgentRuntimeSequenceScenario = {
  id: string;
  label: string;
  steps: AgentRuntimeSequenceStep[];
};

export type AgentRuntimeSequenceResult = {
  scenarioId: string;
  passed: boolean;
  failures: string[];
};

function feedbackItemFromStep(step: AgentRuntimeSequenceStep): RecentToolFeedbackItem {
  return {
    toolName: step.toolName,
    summary: step.feedback.summary,
    retryable: step.feedback.retryable,
    userDecisionRequired: step.feedback.userDecisionRequired,
    nextActions: step.feedback.nextActions ?? [],
  };
}

function actionName(decision: AgentRecoveryDecision): string | undefined {
  if (decision.kind !== "next_action") return undefined;
  const inputAction = decision.action.input?.action;
  return typeof inputAction === "string" ? inputAction : undefined;
}

export const AGENT_RUNTIME_SEQUENCE_SCENARIOS: AgentRuntimeSequenceScenario[] = [
  {
    id: "authoring-diagnostics-fix-loop",
    label: "Patch, diagnose, fix, patch, and verify clean diagnostics",
    steps: [
      {
        label: "patch saved",
        toolName: "workspace_program",
        feedback: {
          summary: "Program patch saved; diagnostics should be checked.",
          nextActions: [
            {
              tool: "workspace_program",
              reason: "Verify the patched program body.",
              priority: "recommended",
              input: { action: "diagnostics", waitMs: 30000 },
            },
          ],
        },
        expect: {
          decision: "next_action",
          tool: "workspace_program",
          action: "diagnostics",
        },
      },
      {
        label: "diagnostics failed",
        toolName: "workspace_program",
        feedback: {
          summary: "Action: diagnostics found 1 syntax error(s).",
          nextActions: [
            {
              tool: "workspace_program",
              reason: "Fix reported issues, patch again, then rerun diagnostics.",
              priority: "required",
              input: { action: "read_data", mode: "content" },
            },
          ],
        },
        expect: {
          decision: "next_action",
          tool: "workspace_program",
          action: "read_data",
        },
      },
      {
        label: "second patch saved",
        toolName: "workspace_program",
        feedback: {
          summary: "Program patch saved; diagnostics should be checked.",
          nextActions: [
            {
              tool: "workspace_program",
              reason: "Verify the patched program body.",
              priority: "recommended",
              input: { action: "diagnostics", waitMs: 30000 },
            },
          ],
        },
        expect: {
          decision: "next_action",
          tool: "workspace_program",
          action: "diagnostics",
        },
      },
      {
        label: "diagnostics passed",
        toolName: "workspace_program",
        feedback: {
          summary: "Action: diagnostics passed.",
          nextActions: [],
        },
        expect: {
          decision: "none",
        },
      },
    ],
  },
  {
    id: "occupied-slot-user-decision",
    label: "Unsafe layout recovery asks the user instead of choosing a mutation",
    steps: [
      {
        label: "move conflict",
        toolName: "qkrpc_action_move",
        feedback: {
          summary: "Destination slot is occupied.",
          userDecisionRequired: true,
          nextActions: [
            {
              tool: "qkrpc_action_move",
              reason: "Swap with occupant.",
              priority: "recommended",
              input: { onOccupiedSlot: "swap" },
            },
          ],
        },
        expect: {
          decision: "ask_user",
        },
      },
    ],
  },
];

export function evaluateAgentRuntimeSequenceScenario(
  scenario: AgentRuntimeSequenceScenario,
): AgentRuntimeSequenceResult {
  const failures: string[] = [];
  for (const step of scenario.steps) {
    const decision = chooseRecoveryDecision([feedbackItemFromStep(step)]);
    if (decision.kind !== step.expect.decision) {
      failures.push(`${step.label}: decision ${decision.kind} !== ${step.expect.decision}`);
      continue;
    }
    if (
      step.expect.tool
      && decision.kind === "next_action"
      && decision.action.tool !== step.expect.tool
    ) {
      failures.push(`${step.label}: tool ${decision.action.tool} !== ${step.expect.tool}`);
    }
    const actualAction = actionName(decision);
    if (step.expect.action && actualAction !== step.expect.action) {
      failures.push(`${step.label}: action ${actualAction ?? "none"} !== ${step.expect.action}`);
    }
  }

  return {
    scenarioId: scenario.id,
    passed: failures.length === 0,
    failures,
  };
}

export function evaluateAgentRuntimeSequenceScenarios(
  scenarios: readonly AgentRuntimeSequenceScenario[] = AGENT_RUNTIME_SEQUENCE_SCENARIOS,
): AgentRuntimeSequenceResult[] {
  return scenarios.map(evaluateAgentRuntimeSequenceScenario);
}
