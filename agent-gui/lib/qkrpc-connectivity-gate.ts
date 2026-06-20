import {
  getRequestThreadId,
  qkrpcRequestContext,
} from "@/lib/qkrpc-request-context";

type ConnectivityThreadFlags = {
  blocked?: boolean;
};

const connectivityFlagsByThread = new Map<string, ConnectivityThreadFlags>();

function threadFlags(): ConnectivityThreadFlags {
  const threadId = getRequestThreadId()?.trim();
  if (!threadId) return {};
  let flags = connectivityFlagsByThread.get(threadId);
  if (!flags) {
    flags = {};
    connectivityFlagsByThread.set(threadId, flags);
  }
  return flags;
}

export function markQkrpcConnectivityBlockedThisTurn(): void {
  const store = qkrpcRequestContext.getStore();
  if (store) {
    store.qkrpcConnectivityBlockedThisTurn = true;
  }
  threadFlags().blocked = true;
}

export function clearQkrpcConnectivityBlockedThisTurn(): void {
  const store = qkrpcRequestContext.getStore();
  if (store) {
    store.qkrpcConnectivityBlockedThisTurn = false;
  }
  threadFlags().blocked = false;
}

export function isQkrpcConnectivityBlockedThisTurn(): boolean {
  return (
    qkrpcRequestContext.getStore()?.qkrpcConnectivityBlockedThisTurn === true
    || threadFlags().blocked === true
  );
}

/** Test helper — clear per-thread connectivity gate. */
export function clearQkrpcConnectivityGateForTests(threadId?: string): void {
  if (threadId) {
    connectivityFlagsByThread.delete(threadId);
    return;
  }
  connectivityFlagsByThread.clear();
}
