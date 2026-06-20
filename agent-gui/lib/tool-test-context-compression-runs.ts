import type { AgentUIMessage, ContextCompressionMetadata } from "@/lib/chat-types";
import type { ContextCompressionPreview } from "@/lib/context-compression-shared";

export type ContextCompressionRunMode = "dry-run" | "chat" | "agent-view" | "harness";

export type HarnessPreviewRunResult = {
  kind: "sliding-window" | "shell-artifact" | "list-tools-routing" | "static-shell";
  beforeChars?: number;
  afterChars?: number;
  savedChars?: number;
  applied?: boolean;
  tokensSavedEstimate?: number;
  oldTurnPreviewed?: boolean;
  recentTurnFull?: boolean;
  modelMessageCount?: number;
  totalOutputChars?: number;
  artifactPath?: string;
  bytesWritten?: number;
  modelPayloadChars?: number;
  displayDataChars?: number;
  readHint?: string;
  modelPayloadJson?: string;
  compactPromptChars?: number;
  coreRoutingChars?: number;
  fullRoutingTableChars?: number;
  savedVsFull?: number;
  savingsPercent?: number;
  systemPromptTokens?: number;
  toolDefinitionTokens?: number;
  toolDefinitionTokensFull?: number;
  slimExtendedToolCount?: number;
  totalStaticTokens?: number;
  toolCount?: number;
  systemWithinTarget?: boolean;
  toolsWithinBudget?: boolean;
  targetSystemTokens?: number;
  staticSegments?: Array<{ label: string; tokens: number }>;
};

export type AgentViewCompressRunResult = {
  beforeChars: number;
  afterChars: number;
  savedChars: number;
  compressed: boolean;
  compressionEnabled?: boolean;
  summary?: string;
  modelTokens?: number;
  nextAction?: string;
  modelPayloadJson?: string;
};

export type ContextCompressionDryRunResult = {
  compressed: boolean;
  preview: ContextCompressionPreview;
  summary: string | null;
  systemSuffix: string | null;
  modelMessageCount: number;
  contextCompression: ContextCompressionMetadata | null;
  reusedSummary: boolean;
  summarizeCalled: boolean;
  slidingWindowApplied?: boolean;
  historyArtifactPath?: string;
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
  agentView?: AgentViewCompressRunResult;
  harness?: HarnessPreviewRunResult;
  chatMessages?: AgentUIMessage[];
  error?: string;
};

export function createContextCompressionRunId(): string {
  return `ctxcmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
