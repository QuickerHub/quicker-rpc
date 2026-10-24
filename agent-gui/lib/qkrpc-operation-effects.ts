import type { QkrpcInvoke } from "./qkrpc-argv";

/** Invoke persistence facts; these do not grant tool-mode permissions or describe bootstrap/wrapper work. */
export type QkrpcOperationEffects = Readonly<{
  mayMutateHost: boolean;
  mayPersistLocal: boolean;
}>;

const READ: QkrpcOperationEffects = Object.freeze({ mayMutateHost: false, mayPersistLocal: false });
const LOCAL_EXPORT: QkrpcOperationEffects = Object.freeze({ mayMutateHost: false, mayPersistLocal: true });
const UNKNOWN: QkrpcOperationEffects = Object.freeze({ mayMutateHost: true, mayPersistLocal: true });

// Invoke effects only: workspace augmentation performed by a tool wrapper is a separate operation.
const effectsByOperation = new Map<string, QkrpcOperationEffects>([
  ["resource.catalog.page", READ],
  ["ping", READ], ["host.list", READ], ["action.list", READ], ["action.search", READ],
  ["action.mention-search", READ], ["action.get", READ], ["action.open", LOCAL_EXPORT],
  ["action.shared.get", READ], ["action.library.search", READ], ["action.publish.preflight", READ],
  ["action.shared-info.get", READ], ["action.validate", READ], ["action.extract", LOCAL_EXPORT],
  ["subprogram.search", READ], ["subprogram.list", READ], ["subprogram.get", READ],
  ["subprogram.validate", READ], ["subprogram.export", LOCAL_EXPORT], ["clipboard.read-special-format", READ],
  ["fa.search", READ], ["fa.resolve", READ], ["fa.page", READ], ["expr.check", READ], ["script.check", READ],
  ["chrome.tabs", READ], ["quicker.account.get", READ], ["quicker.web-session.get", READ],
  ["settings.search", READ], ["settings.list", READ], ["settings.get", READ], ["settings.pages", READ],
  ["settings.links", READ], ["settings.resolve", READ], ["trigger.list", READ], ["trigger.events", READ],
  ["launcher.resolve", READ], ["search-index.status", READ], ["designer.context", READ],
  ["project.diagnostics.get", READ], ["step-runner.list", READ], ["step-runner.search", READ],
  ["step-runner.get", READ], ["step-runner.getUi", READ], ["step-runner.getui", READ],
  ["step-runner.summaries", READ], ["step-runner.quickinsertsearch", READ], ["step-runner.toolboxsearch", READ],
]);

export function isOfflineSourceInvoke(invoke: QkrpcInvoke): boolean {
  return invoke.op === "action.binding" || (invoke.op === "action.save" && invoke.args.dryRun === true);
}

export function getQkrpcOperationEffects(invoke: QkrpcInvoke): QkrpcOperationEffects {
  if (isOfflineSourceInvoke(invoke) || invoke.op.startsWith("guide.")) return READ;
  return effectsByOperation.get(invoke.op) ?? UNKNOWN;
}

/** A host read may still export persistent local files, so it is not necessarily safe to repeat. */
export function isQkrpcInvokeReplaySafe(invoke: QkrpcInvoke): boolean {
  const effects = getQkrpcOperationEffects(invoke);
  return !effects.mayMutateHost && !effects.mayPersistLocal;
}
