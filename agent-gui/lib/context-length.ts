import type { AgentUIMessage } from "@/lib/chat-types";

/** Model context window label from token catalog (e.g. 272K). */
export function formatContextWindowLabel(tokenLimit: number): string {
  if (tokenLimit >= 1_000_000) {
    const m = tokenLimit / 1_000_000;
    return Number.isInteger(m) ? `${m}M` : `${m.toFixed(1)}M`;
  }
  if (tokenLimit >= 1000) {
    return `${Math.round(tokenLimit / 1000)}K`;
  }
  return String(tokenLimit);
}

/** Latest assistant turn: API-reported usage from the model call (not summed). */
export function getLatestContextUsage(
  messages: AgentUIMessage[],
): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    const meta = message.metadata;
    if (!meta) continue;

    const hasUsage =
      meta.inputTokens !== undefined
      || meta.outputTokens !== undefined
      || meta.totalTokens !== undefined;
    if (!hasUsage) continue;

    const inputTokens = meta.inputTokens ?? 0;
    const outputTokens = meta.outputTokens ?? 0;
    const totalTokens =
      meta.totalTokens ?? (inputTokens + outputTokens > 0 ? inputTokens + outputTokens : 0);

    return { inputTokens, outputTokens, totalTokens };
  }
  return null;
}

export type ApiContextUsageSnapshot = {
  inputTokens: number;
  outputTokens: number;
  windowLabel: string;
  tokenLimit: number;
  pct: number;
  hasData: boolean;
  warn: boolean;
};

/** Context fill from the latest model API response (inputTokens vs window). */
export function buildApiContextUsageSnapshot(
  messages: AgentUIMessage[],
  tokenLimit: number,
): ApiContextUsageSnapshot {
  const windowLabel = formatContextWindowLabel(tokenLimit);
  const latestUsage = getLatestContextUsage(messages);
  const inputTokens = latestUsage?.inputTokens ?? 0;
  const outputTokens = latestUsage?.outputTokens ?? 0;
  const hasData = inputTokens > 0;
  const pct =
    hasData && tokenLimit > 0
      ? Math.min(100, (inputTokens / tokenLimit) * 100)
      : 0;

  return {
    inputTokens,
    outputTokens,
    windowLabel,
    tokenLimit,
    pct,
    hasData,
    warn: pct >= 90,
  };
}
