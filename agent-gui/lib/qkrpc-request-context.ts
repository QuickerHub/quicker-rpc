import { AsyncLocalStorage } from "node:async_hooks";
import type { ActionScopeHint } from "@/lib/action-scope";

export type QkrpcRequestContext = {
  cwd?: string;
  actionScope?: ActionScopeHint;
};

export const qkrpcRequestContext = new AsyncLocalStorage<QkrpcRequestContext>();

export function getRequestCwd(): string | undefined {
  return qkrpcRequestContext.getStore()?.cwd;
}

export function getRequestActionScope(): ActionScopeHint | undefined {
  return qkrpcRequestContext.getStore()?.actionScope;
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

export function runWithAgentRequestContext<T>(
  ctx: { cwd?: string; actionScope?: ActionScopeHint },
  fn: () => T,
): T {
  return qkrpcRequestContext.run(
    {
      cwd: ctx.cwd?.trim() || undefined,
      actionScope: ctx.actionScope,
    },
    fn,
  );
}

export async function runWithAgentRequestContextAsync<T>(
  ctx: { cwd?: string; actionScope?: ActionScopeHint },
  fn: () => Promise<T>,
): Promise<T> {
  return qkrpcRequestContext.run(
    {
      cwd: ctx.cwd?.trim() || undefined,
      actionScope: ctx.actionScope,
    },
    fn,
  );
}
