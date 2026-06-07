import {
  getToolOrDynamicToolName,
  isReasoningUIPart,
  isTextUIPart,
  isToolOrDynamicToolUIPart,
  type UIMessage,
} from "ai";
import { isHiddenChatTool } from "@/lib/hidden-chat-tools";
import {
  isAskQuestionAwaitingInput,
} from "@/lib/ask-question-tool";
import { QKRPC_TOOL_REGISTRY } from "@/lib/tool-registry";

function formatToolDisplayName(toolName: string): string {
  return toolName.replace(/^qkrpc_/, "").replace(/_/g, " ");
}

export type AgentActivityPhase =
  | "connecting"
  | "reconnecting"
  | "planning"
  | "reasoning"
  | "tool"
  | "writing"
  | "approval";

export type AgentActivity = {
  phase: AgentActivityPhase;
  label: string;
};

export type ChatRunStatus =
  | "ready"
  | "submitted"
  | "streaming"
  | "error"
  | string;

function toolActivityLabel(toolName: string): string {
  const meta = QKRPC_TOOL_REGISTRY.find((t) => t.id === toolName);
  if (meta) return meta.label;
  return formatToolDisplayName(toolName);
}

function findLastAssistantMessage(
  messages: UIMessage[],
): UIMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "assistant") return messages[i];
  }
  return undefined;
}

/** Cursor-style live status while the agent is working or awaiting approval. */
export function resolveAgentActivity(input: {
  chatStatus: ChatRunStatus;
  messages: UIMessage[];
  qkrpcOk: boolean;
  qkrpcLoading: boolean;
  pendingApprovalCount: number;
  pendingAskQuestionCount?: number;
}): AgentActivity | null {
  const busy =
    input.chatStatus === "submitted" || input.chatStatus === "streaming";
  const pendingAsk = input.pendingAskQuestionCount ?? 0;

  if (input.pendingApprovalCount > 0 && !busy) {
    return {
      phase: "approval",
      label: `等待确认 ${input.pendingApprovalCount} 个操作…`,
    };
  }

  if (pendingAsk > 0 && !busy) {
    return {
      phase: "approval",
      label: pendingAsk === 1 ? "等待你的选择…" : `等待 ${pendingAsk} 个选择…`,
    };
  }

  if (!busy) return null;

  if (input.qkrpcLoading) {
    return { phase: "reconnecting", label: "检测 Quicker 连接…" };
  }

  if (!input.qkrpcOk) {
    return { phase: "reconnecting", label: "正在连接 Quicker…" };
  }

  if (input.chatStatus === "submitted") {
    return { phase: "connecting", label: "正在连接模型…" };
  }

  const lastAssistant = findLastAssistantMessage(input.messages);
  if (!lastAssistant) {
    return { phase: "planning", label: "规划下一步…" };
  }

  let runningTool: string | undefined;
  let needsApproval = false;

  for (const part of lastAssistant.parts) {
    if (!isToolOrDynamicToolUIPart(part)) continue;
    const toolName = getToolOrDynamicToolName(part);
    if (isHiddenChatTool(toolName)) continue;
    const state = "state" in part ? part.state : "";
    if (state === "approval-requested") {
      needsApproval = true;
    }
    if (state === "input-streaming" || state === "input-available") {
      runningTool = toolName;
    }
  }

  if (needsApproval) {
    return { phase: "approval", label: "等待确认操作…" };
  }

  if (runningTool) {
    if (isAskQuestionAwaitingInput(runningTool, "input-available")) {
      return { phase: "approval", label: "等待你的选择…" };
    }
    return {
      phase: "tool",
      label: `正在执行 · ${toolActivityLabel(runningTool)}…`,
    };
  }

  const hasAssistantText = lastAssistant.parts.some(
    (part) => isTextUIPart(part) && part.text.trim().length > 0,
  );
  if (hasAssistantText) {
    return { phase: "writing", label: "正在生成回复…" };
  }

  const hasStreamingReasoning = lastAssistant.parts.some(
    (part) =>
      isReasoningUIPart(part)
      && part.text.trim().length > 0
      && part.state === "streaming",
  );
  if (hasStreamingReasoning) {
    return { phase: "reasoning", label: "正在思考…" };
  }

  return { phase: "planning", label: "规划下一步…" };
}

export const PLANNING_ACTIVITY_LABELS = [
  "规划下一步…",
  "分析任务…",
  "准备下一步操作…",
] as const;

export const CONNECTING_ACTIVITY_LABELS = [
  "正在连接模型…",
  "等待模型响应…",
] as const;

/** Assistant shell with no visible text or tool rows yet (streaming placeholder). */
export function isPlaceholderAssistantMessage(message: UIMessage): boolean {
  if (message.role !== "assistant") return false;
  if (message.parts.length === 0) return true;

  for (const part of message.parts) {
    if (isTextUIPart(part)) {
      if (part.text.trim().length > 0) return false;
      continue;
    }
    if (isReasoningUIPart(part)) {
      if (part.text.trim().length > 0) return false;
      continue;
    }
    if (isToolOrDynamicToolUIPart(part)) {
      if (!isHiddenChatTool(getToolOrDynamicToolName(part))) return false;
    }
  }

  return true;
}

