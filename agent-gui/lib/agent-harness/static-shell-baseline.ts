import type { ChatMode } from "@/lib/chat-mode";
import { estimateTextTokens, estimateToolsTokens } from "@/lib/agent-harness/context-report";

/** Design target: system + skills + rules + routing (excludes tool JSON schemas). */
export const STATIC_SHELL_SYSTEM_TARGET_TOKENS = 8_000;

/** Soft ceiling for tool-definition payload on an empty turn (observability only). */
export const STATIC_SHELL_TOOLS_BUDGET_TOKENS = 16_000;

export type StaticShellSegment = {
  id: string;
  label: string;
  chars: number;
  tokens: number;
};

export type StaticShellHarnessFlags = {
  preloadSkillsFull: boolean;
  workspaceRulesFull: boolean;
  toolResultCompression: boolean;
  slimToolSchemas: boolean;
};

export type StaticShellBaselineReport = {
  measuredAt: number;
  cwd: string;
  chatMode: ChatMode;
  harnessFlags: StaticShellHarnessFlags;
  segments: StaticShellSegment[];
  /** Full composed system string (no L2 suffix / scope / title). */
  systemPromptChars: number;
  systemPromptTokens: number;
  toolDefinitionTokens: number;
  /** Present when slimToolSchemas is on — full schema token estimate for comparison. */
  toolDefinitionTokensFull?: number;
  slimExtendedToolCount?: number;
  toolCount: number;
  enabledToolIds: string[];
  /** system + tools on an empty turn (no user messages). */
  totalStaticTokens: number;
  targets: {
    systemTokens: number;
    systemWithinTarget: boolean;
    toolsBudgetTokens: number;
    toolsWithinBudget: boolean;
  };
};

export function segmentFromText(id: string, label: string, text: string): StaticShellSegment {
  const chars = text.length;
  return { id, label, chars, tokens: estimateTextTokens(text) };
}

export function summarizeStaticShellBaseline(params: {
  cwd: string;
  chatMode: ChatMode;
  harnessFlags: StaticShellHarnessFlags;
  segments: StaticShellSegment[];
  systemPrompt: string;
  tools: Record<string, { description?: string; inputSchema?: unknown }>;
  enabledToolIds: string[];
  toolDefinitionTokensFull?: number;
  slimExtendedToolCount?: number;
}): StaticShellBaselineReport {
  const systemPromptTokens = estimateTextTokens(params.systemPrompt);
  const toolDefinitionTokens = estimateToolsTokens(params.tools);

  return {
    measuredAt: Date.now(),
    cwd: params.cwd,
    chatMode: params.chatMode,
    harnessFlags: params.harnessFlags,
    segments: params.segments,
    systemPromptChars: params.systemPrompt.length,
    systemPromptTokens,
    toolDefinitionTokens,
    toolDefinitionTokensFull: params.toolDefinitionTokensFull,
    slimExtendedToolCount: params.slimExtendedToolCount,
    toolCount: Object.keys(params.tools).length,
    enabledToolIds: params.enabledToolIds,
    totalStaticTokens: systemPromptTokens + toolDefinitionTokens,
    targets: {
      systemTokens: STATIC_SHELL_SYSTEM_TARGET_TOKENS,
      systemWithinTarget: systemPromptTokens <= STATIC_SHELL_SYSTEM_TARGET_TOKENS,
      toolsBudgetTokens: STATIC_SHELL_TOOLS_BUDGET_TOKENS,
      toolsWithinBudget: toolDefinitionTokens <= STATIC_SHELL_TOOLS_BUDGET_TOKENS,
    },
  };
}
