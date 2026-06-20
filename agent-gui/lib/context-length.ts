import type { AgentUIMessage, TurnContextReport } from "@/lib/chat-types";
import { reconcileTurnContextReportWithApiUsage } from "@/lib/agent-harness/context-report";

export { reconcileTurnContextReportWithApiUsage };

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

/** Latest assistant turn: last stream step usage (prompt size), not finish.totalUsage across tool steps. */
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

export type ContextReportCategoryStyle = {
  id: string;
  color: string;
};

export const CONTEXT_REPORT_CATEGORY_STYLES: ContextReportCategoryStyle[] = [
  { id: "system", color: "var(--ad-accent-blue, #3b82f6)" },
  { id: "tools", color: "var(--ad-accent-purple, #8b5cf6)" },
  { id: "conversation", color: "var(--ad-accent-green, #22c55e)" },
  { id: "summarized", color: "var(--ad-accent-amber, #f59e0b)" },
];

export function getLatestContextReport(
  messages: AgentUIMessage[],
): TurnContextReport | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    const report = message.metadata?.contextReport;
    if (!report) continue;
    return reconcileTurnContextReportWithApiUsage(
      report,
      message.metadata?.inputTokens,
    );
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
  compressionSummary: string | null;
};

export function getLatestContextCompressionSummary(
  messages: AgentUIMessage[],
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    const summary = message.metadata?.contextCompression?.summary?.trim();
    if (summary) return summary;
  }
  return null;
}

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
    compressionSummary: getLatestContextCompressionSummary(messages),
  };
}
