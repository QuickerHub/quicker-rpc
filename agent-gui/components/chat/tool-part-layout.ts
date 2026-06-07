import {
  getToolOrDynamicToolName,
  isReasoningUIPart,
  isTextUIPart,
  isToolOrDynamicToolUIPart,
  type DynamicToolUIPart,
  type ToolUIPart,
  type UIMessage,
} from "ai";
import type { ReasoningUIPart } from "ai";
import { hasFailedStructuredToolOutput } from "@/lib/tool-display";
import {
  buildToolSummaryMeta,
  formatToolDisplayName,
  summarizeToolOutput,
} from "./tool-output";
import { isHiddenChatTool } from "@/lib/hidden-chat-tools";
import { isAskQuestionAwaitingInput } from "@/lib/ask-question-tool";
import { SHELL_EXEC_TOOL } from "@/lib/shell-tool-constants";
import {
  aggregateWorkspaceWriteToolLineDiff,
  formatLineDiffSummary,
  isWorkspaceExplorerFileTool,
  workspaceFileRunningMeta,
} from "@/lib/workspace-file-tool";

export type ToolUiPart = ToolUIPart | DynamicToolUIPart;

export function isToolUiPart(
  part: UIMessage["parts"][number],
): part is ToolUiPart {
  return isToolOrDynamicToolUIPart(part);
}

export function getToolUiPartState(part: ToolUiPart): string {
  return "state" in part ? (part.state as string) : "unknown";
}

export function isToolUiPartRunning(state: string): boolean {
  return state === "input-streaming" || state === "input-available";
}

export function isToolUiPartTerminal(state: string): boolean {
  return (
    state === "output-available"
    || state === "output-error"
    || state === "output-denied"
  );
}

export type ToolUiPartAnalysis = {
  part: ToolUiPart;
  index: number;
  name: string;
  displayName: string;
  state: string;
  meta: string;
  isRunning: boolean;
  needsAttention: boolean;
};

export function analyzeToolUiPart(
  part: ToolUiPart,
  index: number,
): ToolUiPartAnalysis {
  const name = getToolOrDynamicToolName(part);
  const state = getToolUiPartState(part);
  const input = "input" in part ? part.input : undefined;
  const output =
    "output" in part && part.output !== undefined ? part.output : undefined;
  const isRunning = isToolUiPartRunning(state);
  const summary =
    output !== undefined
    && (state === "output-available" || hasFailedStructuredToolOutput(output))
      ? summarizeToolOutput(name, output, input)
      : null;
  const runningMeta =
    isRunning && isWorkspaceExplorerFileTool(name, input)
      ? workspaceFileRunningMeta(name, input)
      : null;
  const meta = runningMeta ?? buildToolSummaryMeta(state, summary, name);
  const needsAttention =
    isRunning
    || state === "approval-requested"
    || isAskQuestionAwaitingInput(name, state)
    || state === "output-error"
    || hasFailedStructuredToolOutput(output);

  return {
    part,
    index,
    name,
    displayName: formatToolDisplayName(name, input, output),
    state,
    meta,
    isRunning,
    needsAttention,
  };
}

export type ReasoningSegmentItem = {
  part: UIMessage["parts"][number];
  index: number;
};

export type ActivitySegmentItem =
  | ({ kind: "reasoning" } & ReasoningSegmentItem)
  | ({ kind: "tool" } & ToolUiPartAnalysis);

export type MessagePartSegment =
  | { kind: "text"; part: UIMessage["parts"][number]; index: number }
  | { kind: "reasoning"; items: ReasoningSegmentItem[] }
  | { kind: "tool"; item: ToolUiPartAnalysis }
  | { kind: "tool-batch"; items: ToolUiPartAnalysis[] }
  | { kind: "activity-batch"; items: ActivitySegmentItem[] };

const MIN_TOOLS_IN_BATCH = 2;

function isReasoningSegmentStreaming(items: ReasoningSegmentItem[]): boolean {
  return items.some(
    ({ part }) =>
      part != null
      && isReasoningUIPart(part)
      && (part as ReasoningUIPart).state === "streaming",
  );
}

function activityHasReasoning(items: ActivitySegmentItem[]): boolean {
  return items.some((item) => item.kind === "reasoning");
}

function activityHasTool(items: ActivitySegmentItem[]): boolean {
  return items.some((item) => item.kind === "tool");
}

function activityToolItems(items: ActivitySegmentItem[]): ToolUiPartAnalysis[] {
  return items.filter((item): item is ActivitySegmentItem & { kind: "tool" } =>
    item.kind === "tool",
  );
}

function activityReasoningItems(
  items: ActivitySegmentItem[],
): ReasoningSegmentItem[] {
  return items
    .filter((item): item is ActivitySegmentItem & { kind: "reasoning" } =>
      item.kind === "reasoning",
    )
    .map(({ part, index }) => ({ part, index }));
}

function pushActivitySegment(
  pending: ActivitySegmentItem[],
  segment: MessagePartSegment,
): ActivitySegmentItem[] {
  switch (segment.kind) {
    case "reasoning":
      return pending.concat(
        segment.items.map((item) => ({ kind: "reasoning" as const, ...item })),
      );
    case "tool":
      return pending.concat({ kind: "tool", ...segment.item });
    case "tool-batch":
      return pending.concat(
        segment.items.map((item) => ({ kind: "tool" as const, ...item })),
      );
    case "activity-batch":
      return pending.concat(segment.items);
    default:
      return pending;
  }
}

function flushPendingActivity(
  pending: ActivitySegmentItem[],
  segments: MessagePartSegment[],
): ActivitySegmentItem[] {
  if (pending.length === 0) return pending;

  const hasReasoning = activityHasReasoning(pending);
  const hasTool = activityHasTool(pending);

  if (hasReasoning && hasTool) {
    segments.push({ kind: "activity-batch", items: pending });
  } else if (hasReasoning) {
    segments.push({
      kind: "reasoning",
      items: activityReasoningItems(pending),
    });
  } else if (hasTool) {
    const toolItems = activityToolItems(pending);
    if (toolItems.length >= MIN_TOOLS_IN_BATCH) {
      segments.push({ kind: "tool-batch", items: toolItems });
    } else {
      for (const item of toolItems) {
        segments.push({ kind: "tool", item });
      }
    }
  }

  return [];
}

function mergeConsecutiveActivitySegments(
  segments: MessagePartSegment[],
): MessagePartSegment[] {
  const merged: MessagePartSegment[] = [];
  let pending: ActivitySegmentItem[] = [];

  for (const segment of segments) {
    if (segment.kind === "text") {
      const text = isTextUIPart(segment.part) ? segment.part.text : "";
      if (!text.trim()) continue;
      pending = flushPendingActivity(pending, merged);
      merged.push(segment);
      continue;
    }

    if (segment.kind === "tool" && segment.item.name === SHELL_EXEC_TOOL) {
      pending = flushPendingActivity(pending, merged);
      merged.push(segment);
      continue;
    }

    if (
      segment.kind === "reasoning"
      || segment.kind === "tool"
      || segment.kind === "tool-batch"
      || segment.kind === "activity-batch"
    ) {
      pending = pushActivitySegment(pending, segment);
      continue;
    }

    pending = flushPendingActivity(pending, merged);
    merged.push(segment);
  }

  flushPendingActivity(pending, merged);
  return merged;
}

export function segmentMessageParts(
  parts: UIMessage["parts"],
): MessagePartSegment[] {
  const segments: MessagePartSegment[] = [];
  let pendingActivity: ActivitySegmentItem[] = [];

  const flushActivity = () => {
    pendingActivity = flushPendingActivity(pendingActivity, segments);
  };

  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]!;
    if (isToolUiPart(part)) {
      const name = getToolOrDynamicToolName(part);
      if (!isHiddenChatTool(name)) {
        const item = analyzeToolUiPart(part, index);
        if (name === SHELL_EXEC_TOOL) {
          flushActivity();
          segments.push({ kind: "tool", item });
        } else {
          pendingActivity.push({ kind: "tool", ...item });
        }
      }
      continue;
    }
    if (isReasoningUIPart(part)) {
      // Keep empty streaming placeholders in the batch so segment keys stay stable.
      pendingActivity.push({ kind: "reasoning", part, index });
      continue;
    }
    if (isTextUIPart(part)) {
      if (part.text.trim()) {
        flushActivity();
        segments.push({ kind: "text", part, index });
      }
      continue;
    }
    flushActivity();
  }
  flushActivity();
  return mergeConsecutiveActivitySegments(segments);
}

function buildCompletedToolBatchMeta(
  items: ToolUiPartAnalysis[],
  countLabel: string,
): string {
  const lineDiff = aggregateWorkspaceWriteToolLineDiff(items);
  if (lineDiff) {
    return `${formatLineDiffSummary(lineDiff)} · 完成`;
  }
  return `${countLabel} · 完成`;
}

export function buildToolBatchSummary(items: ToolUiPartAnalysis[]): {
  title: string;
  meta: string;
  allTerminal: boolean;
  needsAttention: boolean;
} {
  const displayNames = [...new Set(items.map((i) => i.displayName))];
  let title: string;
  if (displayNames.length === 1) {
    title = displayNames[0]!;
  } else if (displayNames.length === 2) {
    title = `${displayNames[0]}、${displayNames[1]}`;
  } else {
    title = `${displayNames[0]} 等 ${displayNames.length} 种工具`;
  }

  const n = items.length;
  const running = items.filter((i) => i.isRunning).length;
  const approval = items.filter((i) => i.state === "approval-requested").length;
  const errors = items.filter(
    (i) =>
      i.state === "output-error"
      || ("output" in i.part
        && i.part.output !== undefined
        && hasFailedStructuredToolOutput(i.part.output)),
  ).length;

  let meta: string;
  if (running > 0) {
    meta = `${running}/${n} 执行中…`;
  } else if (approval > 0) {
    meta = approval === 1 ? "待你确认" : `${approval} 个待确认`;
  } else if (errors > 0) {
    meta = errors === 1 ? "1 个失败" : `${errors} 个失败`;
  } else {
    meta = buildCompletedToolBatchMeta(items, `${n} 个`);
  }

  const allTerminal = items.every((i) => isToolUiPartTerminal(i.state));
  const needsAttention = items.some((i) => i.needsAttention);

  return { title, meta, allTerminal, needsAttention };
}

/** Collapse batch UI when every tool finished and none need attention (errors stay open). */
export function shouldCollapseToolBatchWhenIdle(summary: {
  allTerminal: boolean;
  needsAttention: boolean;
}): boolean {
  return summary.allTerminal && !summary.needsAttention;
}

export function buildActivityBatchSummary(items: ActivitySegmentItem[]): {
  title: string;
  meta: string;
  allTerminal: boolean;
  needsAttention: boolean;
  reasoningStreaming: boolean;
} {
  const reasoningItems = activityReasoningItems(items);
  const toolItems = activityToolItems(items);
  const reasoningStreaming = isReasoningSegmentStreaming(reasoningItems);
  const toolSummary =
    toolItems.length > 0 ? buildToolBatchSummary(toolItems) : null;

  const n = items.length;
  let title: string;
  if (reasoningItems.length > 0 && toolItems.length > 0) {
    // Prefer concrete tool names; fall back to step count when tools lack labels.
    title = toolSummary?.title ?? `${n} 步`;
  } else if (reasoningItems.length > 0) {
    title =
      reasoningItems.length > 1
        ? `${reasoningItems.length} thoughts`
        : "Thought";
  } else {
    title = toolSummary?.title ?? "工具";
  }

  let meta: string;
  if (reasoningStreaming) {
    meta = "执行中…";
  } else if (toolSummary && toolSummary.needsAttention) {
    meta = toolSummary.meta;
  } else if (toolSummary && !toolSummary.allTerminal) {
    meta = toolSummary.meta;
  } else {
    meta = buildCompletedToolBatchMeta(toolItems, `${n} 步`);
  }

  const allTerminal = toolSummary ? toolSummary.allTerminal : !reasoningStreaming;
  const needsAttention =
    reasoningStreaming
    || (toolSummary?.needsAttention ?? false);

  return {
    title,
    meta,
    allTerminal,
    needsAttention,
    reasoningStreaming,
  };
}
