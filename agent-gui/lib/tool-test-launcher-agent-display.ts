import {
  isReasoningUIPart,
  isTextUIPart,
  isToolOrDynamicToolUIPart,
} from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  analyzeToolUiPart,
  type ToolUiPartAnalysis,
} from "@/components/chat/tool-part-layout";
import {
  isLauncherExecutionToolName,
  type LauncherAgentResponseCompletionKind,
} from "@/lib/tool-test-launcher-agent-timing";
import { stripModelChannelMarkers } from "@/lib/repair-tool-call";

export type LauncherAgentToolStep = ToolUiPartAnalysis & {
  messageId: string;
};

export type LauncherAgentHiddenContent = {
  reasoningBlocks: number;
  assistantTextParts: number;
  toolsAfterExecution: number;
};

export type LauncherAgentDisplayPlan = {
  userPrompt: string | null;
  /** Flat tool steps for the main tool-chain view. */
  visibleTools: LauncherAgentToolStep[];
  hidden: LauncherAgentHiddenContent;
  /** Index (in full tool list) of first execution tool, if any. */
  executionToolIndex: number | null;
};

function isToolCallTriggered(state: string): boolean {
  return (
    state === "input-streaming"
    || state === "input-available"
    || state === "output-available"
    || state === "output-error"
  );
}

function readUserPrompt(messages: ReadonlyArray<AgentUIMessage>): string | null {
  for (const message of messages) {
    if (message.role !== "user") continue;
    for (const part of message.parts ?? []) {
      if (!isTextUIPart(part)) continue;
      const text = part.text.trim();
      if (text) return text;
    }
  }
  return null;
}

function collectAllToolSteps(
  messages: ReadonlyArray<AgentUIMessage>,
): LauncherAgentToolStep[] {
  const steps: LauncherAgentToolStep[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (let index = 0; index < (message.parts?.length ?? 0); index++) {
      const part = message.parts![index]!;
      if (!isToolOrDynamicToolUIPart(part)) continue;
      steps.push({
        messageId: message.id,
        ...analyzeToolUiPart(part, index),
      });
    }
  }
  return steps;
}

function countHiddenContent(
  messages: ReadonlyArray<AgentUIMessage>,
  truncateAfterToolIndex: number | null,
): LauncherAgentHiddenContent {
  let reasoningBlocks = 0;
  let assistantTextParts = 0;
  let toolsAfterExecution = 0;

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts ?? []) {
      if (isReasoningUIPart(part)) {
        reasoningBlocks += 1;
        continue;
      }
      if (isTextUIPart(part) && message.role === "assistant") {
        const text = stripModelChannelMarkers(part.text);
        if (text) assistantTextParts += 1;
      }
    }
  }

  if (truncateAfterToolIndex != null) {
    const allTools = collectAllToolSteps(messages);
    toolsAfterExecution = Math.max(
      0,
      allTools.length - truncateAfterToolIndex - 1,
    );
  }

  return { reasoningBlocks, assistantTextParts, toolsAfterExecution };
}

/**
 * Build a launcher-agent tool-test display plan: flat tool chain, hide thought/text noise.
 */
export function planLauncherAgentDisplay(
  messages: ReadonlyArray<AgentUIMessage>,
  options?: {
    truncateAfterExecution?: boolean;
    responseCompletionKind?: LauncherAgentResponseCompletionKind;
  },
): LauncherAgentDisplayPlan {
  const allTools = collectAllToolSteps(messages);
  const userPrompt = readUserPrompt(messages);

  let executionToolIndex: number | null = null;
  for (let i = 0; i < allTools.length; i++) {
    const step = allTools[i]!;
    if (
      isLauncherExecutionToolName(step.name)
      && isToolCallTriggered(step.state)
    ) {
      executionToolIndex = i;
      break;
    }
  }

  const shouldTruncate =
    options?.truncateAfterExecution !== false
    && (options?.responseCompletionKind === "execution"
      || executionToolIndex != null);

  const visibleTools =
    shouldTruncate && executionToolIndex != null
      ? allTools.slice(0, executionToolIndex + 1)
      : allTools;

  const hidden = countHiddenContent(
    messages,
    shouldTruncate ? executionToolIndex : null,
  );

  return {
    userPrompt,
    visibleTools,
    hidden,
    executionToolIndex,
  };
}

export function hasLauncherAgentHiddenContent(
  hidden: LauncherAgentHiddenContent,
): boolean {
  return (
    hidden.reasoningBlocks > 0
    || hidden.assistantTextParts > 0
    || hidden.toolsAfterExecution > 0
  );
}

export function formatLauncherAgentHiddenSummary(
  hidden: LauncherAgentHiddenContent,
): string {
  const parts: string[] = [];
  if (hidden.reasoningBlocks > 0) {
    parts.push(
      hidden.reasoningBlocks === 1
        ? "1 段 Thought"
        : `${hidden.reasoningBlocks} 段 Thought`,
    );
  }
  if (hidden.assistantTextParts > 0) {
    parts.push(
      hidden.assistantTextParts === 1
        ? "1 段回复"
        : `${hidden.assistantTextParts} 段回复`,
    );
  }
  if (hidden.toolsAfterExecution > 0) {
    parts.push(
      hidden.toolsAfterExecution === 1
        ? "1 个后续工具"
        : `${hidden.toolsAfterExecution} 个后续工具`,
    );
  }
  return parts.join(" · ");
}
