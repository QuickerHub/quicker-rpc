import type { ChatMode } from "@/lib/chat-mode";
import { CHAT_MODE_LAUNCHER } from "@/lib/chat-mode";

export type ChatRuntimeContextInput = {
  now?: Date;
  mode: ChatMode;
  cwd?: string;
  modelId?: string;
  enabledToolIds: readonly string[];
};

function formatDateForPrompt(now: Date): string {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(now);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return `${date} ${time} Asia/Shanghai`;
}

function summarizeToolAvailability(enabledToolIds: readonly string[]): string {
  if (enabledToolIds.length === 0) return "No user-enabled tools.";
  const uniqueIds = [...new Set(enabledToolIds)].sort();
  return `Enabled tools: ${uniqueIds.join(", ")}`;
}

export function formatChatRuntimeContext({
  now = new Date(),
  mode,
  cwd,
  modelId,
  enabledToolIds,
}: ChatRuntimeContextInput): string {
  const modeLabel = mode === CHAT_MODE_LAUNCHER
    ? "launcher (quick commands)"
    : "agent (full workbench)";
  const lines = [
    "## Runtime context",
    `Now: ${formatDateForPrompt(now)}`,
    `Mode: ${modeLabel}`,
    modelId ? `Model: ${modelId}` : null,
    cwd?.trim() ? `Working directory: ${cwd.trim()}` : null,
    summarizeToolAvailability(enabledToolIds),
    "If the user asks for latest/current external facts, use web_search before answering.",
  ];
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}
