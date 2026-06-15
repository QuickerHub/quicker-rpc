import type { ActionScopeHint } from "@/lib/action-scope";
import type { AgentUIMessage } from "@/lib/chat-types";
import type { ChatMode } from "@/lib/chat-mode";
import {
  chooseRecoveryDecision,
  type AgentRecoveryDecision,
} from "@/lib/agent-recovery-policy";
import {
  buildAgentTurnState,
  type AgentTurnState,
} from "@/lib/agent-turn-state";
import { collectRecentToolFeedback } from "@/lib/tool-feedback-context";

export type AgentRuntimeSnapshot = {
  turnState: AgentTurnState;
  recoveryDecision: AgentRecoveryDecision;
  recentToolFeedbackCount: number;
};

export function buildAgentRuntimeSnapshot(params: {
  actionScope: ActionScopeHint;
  chatMode: ChatMode;
  enabledToolIds: readonly string[];
  messages: AgentUIMessage[];
  userText: string;
}): AgentRuntimeSnapshot {
  const recentToolFeedback = collectRecentToolFeedback(params.messages);
  return {
    turnState: buildAgentTurnState({
      actionScope: params.actionScope,
      chatMode: params.chatMode,
      enabledToolIds: params.enabledToolIds,
      userText: params.userText,
    }),
    recoveryDecision: chooseRecoveryDecision(recentToolFeedback),
    recentToolFeedbackCount: recentToolFeedback.length,
  };
}
