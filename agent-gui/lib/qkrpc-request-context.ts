import { AsyncLocalStorage } from "node:async_hooks";

export type QkrpcRequestContext = {
  cwd?: string;
};

export const qkrpcRequestContext = new AsyncLocalStorage<QkrpcRequestContext>();

export function getRequestCwd(): string | undefined {
  return qkrpcRequestContext.getStore()?.cwd;
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
