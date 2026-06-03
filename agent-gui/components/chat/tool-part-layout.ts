import {
  getToolOrDynamicToolName,
  isToolOrDynamicToolUIPart,
  type DynamicToolUIPart,
  type ToolUIPart,
  type UIMessage,
} from "ai";
import {
  buildToolSummaryMeta,
  formatToolDisplayName,
  summarizeToolOutput,
} from "./tool-output";
import {
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
    state === "output-available" && output !== undefined
      ? summarizeToolOutput(name, output, input)
      : null;
  const runningMeta =
    isRunning && isWorkspaceExplorerFileTool(name)
      ? workspaceFileRunningMeta(name, input)
      : null;
  const meta = runningMeta ?? buildToolSummaryMeta(state, summary);
  const needsAttention =
    isRunning
    || state === "approval-requested"
    || state === "output-error";

  return {
    part,
    index,
    name,
    displayName: formatToolDisplayName(name),
    state,
    meta,
    isRunning,
    needsAttention,
  };
}

export type MessagePartSegment =
  | { kind: "text"; part: UIMessage["parts"][number]; index: number }
  | { kind: "tool"; item: ToolUiPartAnalysis }
  | { kind: "tool-batch"; items: ToolUiPartAnalysis[] };

const MIN_TOOLS_IN_BATCH = 2;

export function segmentMessageParts(
  parts: UIMessage["parts"],
): MessagePartSegment[] {
  const segments: MessagePartSegment[] = [];
  let pending: ToolUiPartAnalysis[] = [];

  const flushTools = () => {
    if (pending.length === 0) return;
    if (pending.length >= MIN_TOOLS_IN_BATCH) {
      segments.push({ kind: "tool-batch", items: pending });
    } else {
      for (const item of pending) {
        segments.push({ kind: "tool", item });
      }
    }
    pending = [];
  };

  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]!;
    if (isToolUiPart(part)) {
      pending.push(analyzeToolUiPart(part, index));
      continue;
    }
    flushTools();
    segments.push({ kind: "text", part, index });
  }
  flushTools();
  return segments;
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
  const errors = items.filter((i) => i.state === "output-error").length;

  let meta: string;
  if (running > 0) {
    meta = `${running}/${n} 执行中…`;
  } else if (approval > 0) {
    meta = approval === 1 ? "待你确认" : `${approval} 个待确认`;
  } else if (errors > 0) {
    meta = errors === 1 ? "1 个失败" : `${errors} 个失败`;
  } else {
    meta = `${n} 个 · 完成`;
  }

  const allTerminal = items.every((i) => isToolUiPartTerminal(i.state));
  const needsAttention = items.some((i) => i.needsAttention);

  return { title, meta, allTerminal, needsAttention };
}
