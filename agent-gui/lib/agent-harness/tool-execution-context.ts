import type { ActionScopeHint } from "@/lib/action-scope";
import type { ChatMode } from "@/lib/chat-mode";
import type { AgentRequestContext } from "@/lib/qkrpc-request-context";

/** Workspace-relative directory for large tool output artifacts. */
export const AGENT_ARTIFACT_DIR = ".local/agent-artifacts";

/** Explicit per-turn context for tool execution (Phase 4 — ALS remains compat layer). */
export type ToolExecutionContext = {
  cwd: string;
  chatMode: ChatMode;
  actionScope: ActionScopeHint;
  threadId?: string;
  artifactDir: string;
  lastUserText?: string;
  llmSelectionRaw?: string;
};

export function buildToolExecutionContext(params: {
  cwd: string;
  chatMode: ChatMode;
  actionScope: ActionScopeHint;
  threadId?: string;
  lastUserText?: string;
  llmSelectionRaw?: string;
}): ToolExecutionContext {
  return {
    cwd: params.cwd.trim(),
    chatMode: params.chatMode,
    actionScope: params.actionScope,
    threadId: params.threadId?.trim() || undefined,
    artifactDir: AGENT_ARTIFACT_DIR,
    lastUserText: params.lastUserText?.trim() || undefined,
    llmSelectionRaw: params.llmSelectionRaw?.trim() || undefined,
  };
}

export function toolExecutionContextToAgentRequest(
  ctx: ToolExecutionContext,
): AgentRequestContext {
  return {
    cwd: ctx.cwd,
    chatMode: ctx.chatMode,
    actionScope: ctx.actionScope,
    lastUserText: ctx.lastUserText,
    llmSelectionRaw: ctx.llmSelectionRaw,
    threadId: ctx.threadId,
    artifactDir: ctx.artifactDir,
  };
}
