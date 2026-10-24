import type { AgentUIMessage, ContextCompressionMetadata } from "@/lib/chat-types";
import type { ModelMessage } from "ai";

export type TurnContextReportCategory = {
  id: string;
  label: string;
  tokens: number;
};

/** Estimated token breakdown for one model call (observability; not fed back to the model). */
export type TurnContextReport = {
  contextWindowTokens: number;
  estimatedInputTokens: number;
  categories: TurnContextReportCategory[];
  compression?: ContextCompressionMetadata;
  slidingWindowApplied?: boolean;
};

export type PreparedModelContext = {
  modelMessages: ModelMessage[];
  contextCompression?: ContextCompressionMetadata;
  systemSuffix?: string;
  compressed: boolean;
  slidingWindowApplied?: boolean;
};

export type ChatPostBody = {
  messages: AgentUIMessage[];
  /** Renderer-issued descriptor; validated against the original manual message. */
  liveProgramDocument?: unknown;
  enabledTools?: string[];
  workingDirectory?: string;
  /** @deprecated use workingDirectory */
  workspaceRoot?: string;
  /** @deprecated use llmSelection */
  llmProvider?: string;
  llmSelection?: string;
  titleManual?: boolean;
  titleTestOnly?: boolean;
  /** QuickerBench: isolated task — no action library search / get. */
  benchMode?: boolean;
  contextCompressionForce?: boolean;
  chatMode?: string;
  threadId?: string;
  /** True only for scoped Action Designer WebView embed (`embed=action-designer&entityId=…`). */
  designerEmbedScoped?: boolean;
  actionDesigner?: { entityId: string; isSubProgram?: boolean };
};
