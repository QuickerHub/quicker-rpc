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
  /** Set when launcher_resolve returns a direct-eligible next step. */
  launcherResolveDirectNext?: LauncherResolveAgentNext | null;
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
};

function buildRequestContext(ctx: AgentRequestContext): QkrpcRequestContext {
  return {
    cwd: ctx.cwd?.trim() || undefined,
    actionScope: ctx.actionScope,
    chatMode: ctx.chatMode,
    lastUserText: ctx.lastUserText?.trim() || undefined,
    llmSelectionRaw: ctx.llmSelectionRaw?.trim() || undefined,
    launcherResolveDirectNext: null,
  };
}

export function runWithAgentRequestContext<T>(
  ctx: AgentRequestContext,
  fn: () => T,
): T {
  return qkrpcRequestContext.run(buildRequestContext(ctx), fn);
}

export async function runWithAgentRequestContextAsync<T>(
  ctx: AgentRequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return qkrpcRequestContext.run(buildRequestContext(ctx), fn);
}
