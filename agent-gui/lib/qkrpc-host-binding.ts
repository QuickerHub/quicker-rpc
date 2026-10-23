import type { QkrpcInvoke } from "@/lib/qkrpc-argv";
import { getRequestTurnExecutionState } from "@/lib/qkrpc-request-context";
import { readHostBinding, sameHostBinding, type QkrpcHostBinding } from "./qkrpc-host-binding-contract";
export { readHostBinding, sameHostBinding, type QkrpcHostBinding } from "./qkrpc-host-binding-contract";

export type QkrpcBoundTarget = Readonly<{ gateway: string; binding: QkrpcHostBinding }>;

const READ_OPS = new Set([
  "ping", "host.list", "action.binding", "action.list", "action.search", "action.mention-search", "action.get", "action.open",
  "action.shared.get", "action.library.search", "action.publish.preflight", "action.shared-info.get",
  "action.validate", "action.extract", "subprogram.search", "subprogram.list", "subprogram.get",
  "subprogram.validate", "subprogram.export", "clipboard.read-special-format", "fa.search", "fa.resolve",
  "expr.check", "script.check", "chrome.tabs", "quicker.account.get", "quicker.web-session.get",
  "settings.search", "settings.list", "settings.get", "settings.pages", "settings.links", "settings.resolve",
  "trigger.list", "trigger.events", "launcher.resolve", "search-index.status", "designer.context",
  "project.diagnostics.get",
  "step-runner.list", "step-runner.search", "step-runner.get", "step-runner.getUi", "step-runner.getui",
  "step-runner.summaries", "step-runner.quickinsertsearch", "step-runner.toolboxsearch",
]);

export function isOfflineSourceInvoke(invoke: QkrpcInvoke): boolean {
  return invoke.op === "action.binding" || (invoke.op === "action.save" && invoke.args.dryRun === true);
}

/** New operations default to no replay; the read allowlist is deliberately explicit. */
export function isQkrpcReadOnlyInvoke(invoke: QkrpcInvoke): boolean {
  return isOfflineSourceInvoke(invoke) || READ_OPS.has(invoke.op)
    || invoke.op.startsWith("guide.");
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
