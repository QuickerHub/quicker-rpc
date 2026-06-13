import type { AgentUIMessage, ContextCompressionMetadata } from "@/lib/chat-types";
import type { ContextCompressionPreview } from "@/lib/context-compression-shared";

export type ContextCompressionRunMode = "dry-run" | "chat";

export type ContextCompressionDryRunResult = {
  compressed: boolean;
  preview: ContextCompressionPreview;
  summary: string | null;
  systemSuffix: string | null;
  modelMessageCount: number;
  contextCompression: ContextCompressionMetadata | null;
  reusedSummary: boolean;
  summarizeCalled: boolean;
};

export type ContextCompressionRunEntry = {
  id: string;
  at: number;
  scenarioId: string;
  scenarioLabel: string;
  mode: ContextCompressionRunMode;
  status: "running" | "done" | "error";
  llmSelection: string;
  llmModelLabel: string;
  messageCount: number;
  contextLimit: number;
  force: boolean;
  dryRun?: ContextCompressionDryRunResult;
  chatMessages?: AgentUIMessage[];
  error?: string;
};

export function createContextCompressionRunId(): string {
  return `ctxcmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
