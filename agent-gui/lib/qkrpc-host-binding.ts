import type { QkrpcInvoke } from "@/lib/qkrpc-argv";
import { getRequestTurnExecutionState } from "@/lib/qkrpc-request-context";
import { readHostBinding, sameHostBinding, type QkrpcHostBinding } from "./qkrpc-host-binding-contract";
import { getQkrpcOperationEffects } from "./qkrpc-operation-effects";
export { readHostBinding, sameHostBinding, type QkrpcHostBinding } from "./qkrpc-host-binding-contract";
export { isOfflineSourceInvoke } from "./qkrpc-operation-effects";

export type QkrpcBoundTarget = Readonly<{ gateway: string; binding: QkrpcHostBinding }>;

/** Host binding semantics only; local persistence and replay policy are separate effects. */
export function isQkrpcReadOnlyInvoke(invoke: QkrpcInvoke): boolean {
  return !getQkrpcOperationEffects(invoke).mayMutateHost;
}

export function currentQkrpcTarget(): QkrpcBoundTarget | undefined {
  return getRequestTurnExecutionState()?.qkrpcTarget;
}

export function markUnverifiedQkrpcRead(): void {
  const state = getRequestTurnExecutionState();
  if (state && !state.closed) state.qkrpcUnverifiedRead = true;
}

export function hasUnverifiedQkrpcRead(): boolean {
  return getRequestTurnExecutionState()?.qkrpcUnverifiedRead === true;
}

/** Parallel callers may discover concurrently; committing a different target fails closed. */
export function bindQkrpcTarget(target: QkrpcBoundTarget): QkrpcBoundTarget {
  const state = getRequestTurnExecutionState();
  if (!state || state.closed) return target;
  const existing = state.qkrpcTarget;
  if (existing && (existing.gateway !== target.gateway || !sameHostBinding(existing.binding, target.binding)))
    throw new Error("HOST_BINDING_MISMATCH: this turn already belongs to another gateway/host session.");
  return state.qkrpcTarget ??= Object.freeze(target);
}

export function bindingFailure(code: string, message: string) {
  return { ok: false, exitCode: 1, stdout: "", stderr: message,
    parsed: { ok: false, error: code, message, retryable: false }, truncated: false };
}

export function configuredQkrpcBinding(): QkrpcHostBinding | ReturnType<typeof bindingFailure> | undefined {
  const raw = process.env.QKRPC_HOST_BINDING;
  if (!raw) return;
  try {
    const binding = readHostBinding(JSON.parse(raw));
    if (binding) return binding;
  } catch { /* An explicit destination must never degrade into automatic discovery. */ }
  return bindingFailure("HOST_HANDSHAKE_INVALID", "QKRPC_HOST_BINDING is invalid. No other host was selected.");
}
