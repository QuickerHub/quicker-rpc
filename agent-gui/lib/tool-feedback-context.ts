import type { AgentUIMessage } from "@/lib/chat-types";
import { isStructuredToolResult, type ToolNextAction } from "@/lib/tool-result";

export type RecentToolFeedbackItem = {
  toolName: string;
  summary?: string;
  retryable?: boolean;
  userDecisionRequired?: boolean;
  nextActions: ToolNextAction[];
};

function readToolName(partType: string): string {
  return partType.startsWith("tool-") ? partType.slice("tool-".length) : partType;
}

function isToolOutputPart(
  part: AgentUIMessage["parts"][number],
): part is AgentUIMessage["parts"][number] & {
  state: string;
  output?: unknown;
} {
  return part.type.startsWith("tool-") && "state" in part;
}

export function collectRecentToolFeedback(
  messages: AgentUIMessage[],
  options?: {
    maxMessages?: number;
    maxItems?: number;
  },
): RecentToolFeedbackItem[] {
  const maxMessages = options?.maxMessages ?? 8;
  const maxItems = options?.maxItems ?? 5;
  const items: RecentToolFeedbackItem[] = [];
  const recent = messages.slice(Math.max(0, messages.length - maxMessages));

  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const message = recent[i]!;
    for (let pi = message.parts.length - 1; pi >= 0; pi -= 1) {
      const part = message.parts[pi]!;
      if (!isToolOutputPart(part) || part.state !== "output-available") {
        continue;
      }
      if (!isStructuredToolResult(part.output)) continue;
      const hasFeedback =
        Boolean(part.output.summary?.trim())
        || Boolean(part.output.nextActions?.length)
        || part.output.retryable === true
        || part.output.userDecisionRequired === true;
      if (!hasFeedback) continue;
      items.push({
        toolName: readToolName(part.type),
        summary: part.output.summary,
        retryable: part.output.retryable,
        userDecisionRequired: part.output.userDecisionRequired,
        nextActions: part.output.nextActions ?? [],
      });
      if (items.length >= maxItems) {
        return items;
      }
    }
  }

  return items;
}

function formatNextAction(action: ToolNextAction): string {
  const priority = action.priority ? `${action.priority} ` : "";
  const input = action.input ? ` input=${JSON.stringify(action.input)}` : "";
  return `${priority}${action.tool}: ${action.reason}${input}`;
}

export function formatRecentToolFeedbackForPrompt(
  items: RecentToolFeedbackItem[],
): string {
  if (items.length === 0) return "";
  const lines = [
    "## Recent tool feedback",
    "Use these as recovery/verification hints; do not repeat a tool call blindly if user confirmation is required.",
  ];
  for (const item of items) {
    const flags = [
      item.retryable ? "retryable" : null,
      item.userDecisionRequired ? "needs user decision" : null,
    ].filter(Boolean);
    lines.push(
      `- ${item.toolName}${flags.length ? ` (${flags.join(", ")})` : ""}`
        + (item.summary ? `: ${item.summary}` : ""),
    );
    for (const action of item.nextActions) {
      lines.push(`  next: ${formatNextAction(action)}`);
    }
  }
  return lines.join("\n");
}
