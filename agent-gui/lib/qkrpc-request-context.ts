import { AsyncLocalStorage } from "node:async_hooks";
import type { ActionScopeHint } from "@/lib/action-scope";
import type { ChatMode } from "@/lib/chat-mode";
import type { LauncherResolveAgentNext } from "@/lib/launcher/launcher-resolve-agent-output";

export type QkrpcRequestContext = {
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
  /** workspace_program patch succeeded earlier in this turn. */
  programPatchedThisTurn?: boolean;
  /** qkrpc_action_create succeeded earlier in this turn. */
  actionCreatedThisTurn?: boolean;
  /** workspace_program write_data/edit_data succeeded after create this turn. */
  programDataEditedThisTurn?: boolean;
  /** docs tool calls this user turn. */
  docsCallCountThisTurn?: number;
  /** actionId from qkrpc_action_create this turn. */
  createdActionIdThisTurn?: string;
  /** qkrpc_step_runner_search calls this turn. */
  stepRunnerSearchCountThisTurn?: number;
  /** workspace_program data.json edits after latest patch this turn. */
  editAfterPatchCountThisTurn?: number;
  /** qkrpc connectivity failed — call qkrpc_wait before other qkrpc tools. */
  qkrpcConnectivityBlockedThisTurn?: boolean;
};

export const qkrpcRequestContext = new AsyncLocalStorage<QkrpcRequestContext>();

export function getRequestCwd(): string | undefined {
  return qkrpcRequestContext.getStore()?.cwd;
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
  return qkrpcRequestContext.run({ cwd: cwd?.trim() || undefined }, fn);
}

export async function runWithQkrpcCwdAsync<T>(
  cwd: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return qkrpcRequestContext.run({ cwd: cwd?.trim() || undefined }, fn);
}

export type AgentRequestContext = {
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
  if (parent) {
    next.programPatchedThisTurn = parent.programPatchedThisTurn;
    next.actionCreatedThisTurn = parent.actionCreatedThisTurn;
    next.programDataEditedThisTurn = parent.programDataEditedThisTurn;
    next.docsCallCountThisTurn = parent.docsCallCountThisTurn;
    next.createdActionIdThisTurn = parent.createdActionIdThisTurn;
    next.stepRunnerSearchCountThisTurn = parent.stepRunnerSearchCountThisTurn;
    next.editAfterPatchCountThisTurn = parent.editAfterPatchCountThisTurn;
    next.qkrpcConnectivityBlockedThisTurn = parent.qkrpcConnectivityBlockedThisTurn;
  }
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
