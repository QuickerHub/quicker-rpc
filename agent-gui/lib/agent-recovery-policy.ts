import type { RecentToolFeedbackItem } from "@/lib/tool-feedback-context";
import type { ToolNextAction } from "@/lib/tool-result";

export type AgentRecoveryDecision =
  | {
      kind: "next_action";
      sourceTool: string;
      action: ToolNextAction;
    }
  | {
      kind: "ask_user";
      sourceTool: string;
      reason: string;
    }
  | {
      kind: "none";
    };

const PRIORITY_RANK: Record<NonNullable<ToolNextAction["priority"]>, number> = {
  required: 0,
  recommended: 1,
  optional: 2,
};

function actionRank(action: ToolNextAction): number {
  return PRIORITY_RANK[action.priority ?? "optional"];
}

export function chooseRecoveryDecision(
  feedbackItems: readonly RecentToolFeedbackItem[],
): AgentRecoveryDecision {
  for (const item of feedbackItems) {
    if (item.userDecisionRequired) {
      return {
        kind: "ask_user",
        sourceTool: item.toolName,
        reason: item.summary ?? "Tool feedback requires a user decision.",
      };
    }
  }

  let best:
    | {
        sourceTool: string;
        action: ToolNextAction;
      }
    | null = null;

  for (const item of feedbackItems) {
    for (const action of item.nextActions) {
      if (!best || actionRank(action) < actionRank(best.action)) {
        best = { sourceTool: item.toolName, action };
      }
    }
  }

  if (!best) return { kind: "none" };
  return {
    kind: "next_action",
    sourceTool: best.sourceTool,
    action: best.action,
  };
}

export function formatRecoveryDecisionForPrompt(
  decision: AgentRecoveryDecision,
): string {
  if (decision.kind === "none") return "";
  if (decision.kind === "ask_user") {
    return [
      "## Recovery decision",
      `Ask user before continuing: ${decision.reason}`,
      `Source tool: ${decision.sourceTool}`,
    ].join("\n");
  }
  const input = decision.action.input
    ? `\nInput: ${JSON.stringify(decision.action.input)}`
    : "";
  return [
    "## Recovery decision",
    `Prefer next tool: ${decision.action.tool}`,
    `Priority: ${decision.action.priority ?? "optional"}`,
    `Reason: ${decision.action.reason}`,
    `Source tool: ${decision.sourceTool}${input}`,
  ].join("\n");
}
