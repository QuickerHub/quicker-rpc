import { AsyncLocalStorage } from "node:async_hooks";
import type { ActionScopeHint } from "@/lib/action-scope";
import type { ChatMode } from "@/lib/chat-mode";
import type { LauncherResolveAgentNext } from "@/lib/launcher/launcher-resolve-agent-output";
import {
  createTurnExecutionState,
  type TurnExecutionState,
} from "@/lib/agent-harness/turn-execution-state";

export type QkrpcRequestContext = {
  /** Cancellation owned by the current turn, inherited by nested tool contexts. */
  abortSignal?: AbortSignal;
  /** Shared identity for execution facts; thread ids never own mutable turn state. */
  executionState?: TurnExecutionState;
  cwd?: string;
  actionScope?: ActionScopeHint;
  chatMode?: ChatMode;
  lastUserText?: string;
  /** Serialized LlmSelection for nested agents (task tool). */
  llmSelectionRaw?: string;
  /** Chat thread id for artifact/history naming. */
  threadId?: string;
  /** Workspace-relative artifact root (default .local/agent-artifacts). */
  artifactDir?: string;
  /** Set when launcher_resolve returns a direct-eligible next step. */
  launcherResolveDirectNext?: LauncherResolveAgentNext | null;
  /** QuickerBench / isolated eval — block action library search. */
  benchMode?: boolean;
};

export const qkrpcRequestContext = new AsyncLocalStorage<QkrpcRequestContext>();

export function getRequestCwd(): string | undefined {
  return qkrpcRequestContext.getStore()?.cwd;
}

export function getRequestAbortSignal(): AbortSignal | undefined {
  return qkrpcRequestContext.getStore()?.abortSignal;
}

/** Legacy raw ALS contexts acquire their own state without any process-wide fallback. */
export function getRequestTurnExecutionState(): TurnExecutionState | undefined {
  const store = qkrpcRequestContext.getStore();
  if (!store) return undefined;
  return store.executionState ??= createTurnExecutionState();
}

export function getRequestActionScope(): ActionScopeHint | undefined {
  return qkrpcRequestContext.getStore()?.actionScope;
}

export function getRequestChatMode(): ChatMode | undefined {
  return qkrpcRequestContext.getStore()?.chatMode;
}

export function getRequestLastUserText(): string | undefined {
  return qkrpcRequestContext.getStore()?.lastUserText;
}

export function getRequestLlmSelectionRaw(): string | undefined {
  return qkrpcRequestContext.getStore()?.llmSelectionRaw;
}

export function getRequestThreadId(): string | undefined {
  return qkrpcRequestContext.getStore()?.threadId;
}

export function getRequestArtifactDir(): string | undefined {
  return qkrpcRequestContext.getStore()?.artifactDir;
}

export function getRequestBenchMode(): boolean {
  return qkrpcRequestContext.getStore()?.benchMode === true;
}

export function getLauncherResolveDirectNext():
  | LauncherResolveAgentNext
  | null
  | undefined {
  return qkrpcRequestContext.getStore()?.launcherResolveDirectNext;
}

export function setLauncherResolveDirectNext(
  next: LauncherResolveAgentNext | null,
): void {
  const store = qkrpcRequestContext.getStore();
  if (store) {
    store.launcherResolveDirectNext = next;
  }
}

export function runWithQkrpcCwd<T>(
  cwd: string | undefined,
  fn: () => T,
): T {
  return qkrpcRequestContext.run({
    ...qkrpcRequestContext.getStore(),
    executionState: getRequestTurnExecutionState() ?? createTurnExecutionState(),
    cwd: cwd?.trim() || undefined,
  }, fn);
}

export async function runWithQkrpcCwdAsync<T>(
  cwd: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return qkrpcRequestContext.run({
    ...qkrpcRequestContext.getStore(),
    executionState: getRequestTurnExecutionState() ?? createTurnExecutionState(),
    cwd: cwd?.trim() || undefined,
  }, fn);
}

export type AgentRequestContext = {
  abortSignal?: AbortSignal;
  executionState?: TurnExecutionState;
  cwd?: string;
  actionScope?: ActionScopeHint;
  chatMode?: ChatMode;
  lastUserText?: string;
  llmSelectionRaw?: string;
  threadId?: string;
  artifactDir?: string;
  benchMode?: boolean;
};

function buildRequestContext(ctx: AgentRequestContext): QkrpcRequestContext {
  return {
    cwd: ctx.cwd?.trim() || undefined,
    actionScope: ctx.actionScope,
    chatMode: ctx.chatMode,
    lastUserText: ctx.lastUserText?.trim() || undefined,
    llmSelectionRaw: ctx.llmSelectionRaw?.trim() || undefined,
    threadId: ctx.threadId?.trim() || undefined,
    artifactDir: ctx.artifactDir?.trim() || undefined,
    benchMode: ctx.benchMode === true,
    launcherResolveDirectNext: null,
  };
}

function mergeAgentRequestContext(ctx: AgentRequestContext): QkrpcRequestContext {
  const parent = qkrpcRequestContext.getStore();
  const next: QkrpcRequestContext = { ...parent, ...buildRequestContext(ctx) };
  next.abortSignal = ctx.abortSignal && parent?.abortSignal && ctx.abortSignal !== parent.abortSignal
    ? AbortSignal.any([parent.abortSignal, ctx.abortSignal])
    : ctx.abortSignal ?? parent?.abortSignal;
  next.executionState = ctx.executionState ?? getRequestTurnExecutionState() ?? createTurnExecutionState();
  return next;
}

export function runWithAgentRequestContext<T>(
  ctx: AgentRequestContext,
  fn: () => T,
): T {
  return qkrpcRequestContext.run(mergeAgentRequestContext(ctx), fn);
}

export async function runWithAgentRequestContextAsync<T>(
  ctx: AgentRequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return qkrpcRequestContext.run(mergeAgentRequestContext(ctx), fn);
}
