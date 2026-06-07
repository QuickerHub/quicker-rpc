import type { SettingsIntentBatchSummary } from "@/lib/quicker-settings-intent-check";

export type SettingsIntentRunStatus = "running" | "done" | "error";

export type SettingsIntentRunEntry = {
  id: string;
  at: number;
  triggerLabel?: string;
  utterance?: string;
  status: SettingsIntentRunStatus;
  summary?: SettingsIntentBatchSummary;
  error?: string;
};

export function createSettingsIntentRunId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sir-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function formatSettingsIntentRunTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
