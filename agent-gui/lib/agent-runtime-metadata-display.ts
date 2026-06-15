import type { AgentRecoveryDecision } from "@/lib/agent-recovery-policy";
import type { ChatUsageMetadata } from "@/lib/chat-types";

export type AgentRuntimeMetadataDisplay = {
  exportJson: string;
  intent?: string;
  risk?: string;
  recommendedTools: string[];
  recovery: string;
  feedbackCount: number;
};

function formatRecovery(decision?: AgentRecoveryDecision): string {
  if (!decision || decision.kind === "none") return "none";
  if (decision.kind === "ask_user") return `ask_user: ${decision.sourceTool}`;
  return `${decision.action.tool}:${decision.action.input?.action ?? "next"}`;
}

export function buildAgentRuntimeMetadataExport(
  metadata?: ChatUsageMetadata,
): Record<string, unknown> | null {
  const turnState = metadata?.agentTurnState;
  const recoveryDecision = metadata?.recoveryDecision;
  const feedbackCount = metadata?.recentToolFeedbackCount ?? 0;
  if (!turnState && !recoveryDecision && feedbackCount === 0) return null;
  return {
    feedbackCount,
    recoveryDecision: recoveryDecision ?? { kind: "none" },
    turnState: turnState
      ? {
          intent: turnState.intent,
          recommendedToolIds: turnState.recommendedToolIds,
          risk: turnState.risk,
          targetRefs: turnState.targetRefs,
          verificationHints: turnState.verificationHints,
        }
      : null,
  };
}

export function buildAgentRuntimeMetadataDisplay(
  metadata?: ChatUsageMetadata,
): AgentRuntimeMetadataDisplay | null {
  const turnState = metadata?.agentTurnState;
  const recoveryDecision = metadata?.recoveryDecision;
  const feedbackCount = metadata?.recentToolFeedbackCount ?? 0;
  const exportPayload = buildAgentRuntimeMetadataExport(metadata);
  if (!exportPayload) return null;
  return {
    exportJson: JSON.stringify(exportPayload),
    intent: turnState?.intent,
    risk: turnState?.risk,
    recommendedTools: turnState?.recommendedToolIds ?? [],
    recovery: formatRecovery(recoveryDecision),
    feedbackCount,
  };
}
