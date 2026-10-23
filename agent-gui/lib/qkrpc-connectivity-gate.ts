import { getRequestThreadId, getRequestTurnExecutionState } from "@/lib/qkrpc-request-context";

export function markQkrpcConnectivityBlockedThisTurn(): void {
  const state = getRequestTurnExecutionState();
  if (state && !state.closed) state.qkrpcConnectivityBlocked = true;
}

export function clearQkrpcConnectivityBlockedThisTurn(): void {
  const state = getRequestTurnExecutionState();
  if (state && !state.closed) state.qkrpcConnectivityBlocked = false;
}

export function isQkrpcConnectivityBlockedThisTurn(): boolean {
  const state = getRequestTurnExecutionState();
  return !state?.closed && state?.qkrpcConnectivityBlocked === true;
}

/** Compatibility test helper resets only the current owner. */
export function clearQkrpcConnectivityGateForTests(threadId?: string): void {
  if (threadId && threadId.trim() !== getRequestThreadId()?.trim()) return;
  clearQkrpcConnectivityBlockedThisTurn();
}
