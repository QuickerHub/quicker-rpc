import type { LiveProgramDocumentSelection } from "./live-program-document";
import { parseActionProjectBinding } from "./action-project-binding";
import { workspaceDocumentKey } from "./workspace-document-instances";
import { isLiveProgramSourceTarget } from "./live-program-source-target";

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const cwdKey = (value: string) => value.trim().replace(/\\/g, "/").replace(/\/+$/, "");

/** Invalid live intent stays unavailable; it never restores legacy disk tools. */
export function parseLiveProgramDocumentSelection(value: unknown, expected: { threadId?: string; userMessageId?: string; cwd: string; chatMode: string }): LiveProgramDocumentSelection {
  if (value === undefined) return { state: "none" };
  const invalid = (): LiveProgramDocumentSelection => ({ state: "unavailable", code: "LIVE_DOCUMENT_SCOPE_INVALID",
    error: "实时文档目标与本轮消息或工作区不一致，未回退到磁盘编辑。", retryable: false });
  if (!record(value)) return invalid();
  if (value.state === "none") return { state: "none" };
  if (value.state === "unavailable") return text(value.code) && text(value.error)
    ? { state: "unavailable", code: value.code, error: value.error, retryable: false } : invalid();
  const scope = value.scope;
  if (value.state !== "ready" || !record(scope) || scope.version !== 1 || !text(scope.scopeId)
    || !text(expected.threadId) || scope.threadId !== expected.threadId || !text(expected.userMessageId) || scope.userMessageId !== expected.userMessageId
    || !text(scope.cwd) || cwdKey(scope.cwd) !== cwdKey(expected.cwd) || (scope.mode !== "read" && scope.mode !== "edit") || (expected.chatMode === "ask" && scope.mode !== "read")) return invalid();
  const target = scope.target;
  if (!record(target) || !text(target.sessionId) || !record(target.owner) || !record(target.identity)) return invalid();
  const owner = target.owner, identity = target.identity;
  if (!text(owner.cwd) || owner.cwd !== scope.cwd || !text(owner.tabId) || !text(owner.path)
    || !Number.isSafeInteger(owner.instanceId) || (owner.instanceId as number) < 1 || owner.key !== workspaceDocumentKey(owner.cwd, owner.tabId)
    || !text(identity.documentKey)) return invalid();
  if (target.format === "source-bundle") {
    if (!isLiveProgramSourceTarget(target.source) || Object.hasOwn(identity, "projectBinding") || !record(identity.storage)
      || identity.storage.version !== target.source.sourceSnapshot.revision) return invalid();
  } else if (target.format !== undefined && target.format !== "legacy-json" || !Object.hasOwn(identity, "projectBinding")) return invalid();
  if (identity.host !== undefined && (!record(identity.host) || !text(identity.host.kind) || !text(identity.host.instanceId) || !text(identity.host.actionId))) return invalid();
  if (identity.storage !== undefined && (!record(identity.storage) || !text(identity.storage.key))) return invalid();
  if (target.format !== "source-bundle" && identity.projectBinding !== null) {
    if (!record(identity.projectBinding) || !text(identity.projectBinding.actionId)) return invalid();
    try { parseActionProjectBinding(identity.projectBinding, identity.projectBinding.actionId); } catch { return invalid(); }
  }
  // Validation does not canonicalize away fields used in the renderer's complete
  // identity comparison. A descriptor is still subject to the actual registry grant.
  return structuredClone(value) as LiveProgramDocumentSelection;
}
