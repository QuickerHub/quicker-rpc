import type { ActionScopeHint } from "@/lib/action-scope";
import type { AgentUIMessage } from "@/lib/chat-types";
import type { ChatMode } from "@/lib/chat-mode";
import {
  chooseRecoveryDecision,
  type AgentRecoveryDecision,
} from "@/lib/agent-recovery-policy";
import type { AgentTurnState } from "@/lib/agent-turn-state";
import {
  resolveTurnPlan,
  type TurnPlan,
} from "@/lib/agent-core/turn-plan";
import { collectRecentToolFeedback } from "@/lib/tool-feedback-context";

export type AgentRuntimeSnapshot = {
  turnState: AgentTurnState;
  turnPlan: TurnPlan;
  recoveryDecision: AgentRecoveryDecision;
  recentToolFeedbackCount: number;
};

export function buildAgentRuntimeSnapshot(params: {
  actionScope: ActionScopeHint;
  chatMode: ChatMode;
  enabledToolIds: readonly string[];
  messages: AgentUIMessage[];
  userText: string;
  turnPlan?: TurnPlan;
}): AgentRuntimeSnapshot {
  const recentToolFeedback = collectRecentToolFeedback(params.messages);
  const turnPlan = params.turnPlan
    ?? resolveTurnPlan({
      actionScope: params.actionScope,
      chatMode: params.chatMode,
      enabledToolIds: params.enabledToolIds,
      messages: params.messages,
      userText: params.userText,
    });
  return {
    turnState: turnPlan.turnState,
    turnPlan,
    recoveryDecision: chooseRecoveryDecision(recentToolFeedback),
    recentToolFeedbackCount: recentToolFeedback.length,
  };
}
