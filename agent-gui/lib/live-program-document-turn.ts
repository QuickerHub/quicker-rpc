import type { ChatMode } from "./chat-mode";
import { findProgramStepTagMarkupHits } from "./program-step-tag";
import type { LiveProgramDocumentPin, LiveProgramDocumentRegistry, LiveProgramDocumentRegistryFailure, LiveProgramDocumentSelection } from "./live-program-document";
import { parseLiveProgramDocumentToolInput } from "./live-program-document-tool";
import { formatLocalToolResult, type StructuredToolResult } from "./tool-result";

type PinResult = LiveProgramDocumentPin | LiveProgramDocumentRegistryFailure;
export type LiveProgramDocumentTurnBody = Readonly<{
  liveProgramDocument: LiveProgramDocumentSelection;
  workingDirectory: string;
  chatMode: ChatMode;
  enabledTools: readonly string[];
}>;

function unavailable(code: string, error: string): LiveProgramDocumentSelection {
  return { state: "unavailable", code, error, retryable: false };
}

/** Stores turn grants and immutable receipts, never an editable document or history. */
export function createLiveProgramDocumentTurn(options: {
  threadId: string;
  getRegistry(): LiveProgramDocumentRegistry | null;
}) {
  const pins = new Map<string, PinResult>();
  const results = new Map<string, StructuredToolResult>();
  let body: LiveProgramDocumentTurnBody | undefined;
  let owner: LiveProgramDocumentRegistry | null = null;
  let stopped = true;
  let generation = 0;
  const revoke = (reason: string) => {
    stopped = true;
    if (body?.liveProgramDocument.state === "ready") owner?.revokeScope(body.liveProgramDocument.scope.scopeId, reason);
  };
  return {
    rememberPin(tagId: string, pin: PinResult | undefined) {
      pins.set(tagId, pin ?? { ok: false, code: "LIVE_PIN_UNAVAILABLE", error: "此步骤标签没有当前设计器的实时授权，请从原文档重新添加到对话。", retryable: false });
    },
    begin(input: { userMessageId: string; text: string; cwd: string; chatMode: ChatMode; enabledTools: readonly string[] }) {
      generation++;
      revoke("A new manual user message replaced the previous live turn");
      results.clear();
      owner = options.getRegistry();
      const hits = findProgramStepTagMarkupHits(input.text);
      const intent = hits.length > 0 || /<qkrpc-program-step\b/i.test(input.text);
      let selection: LiveProgramDocumentSelection = { state: "none" };
      if (intent) {
        const selected = hits.map(({ tag }) => pins.get(tag.tagId));
        for (const { tag } of hits) pins.delete(tag.tagId);
        if (!hits.length || selected.some((pin) => !pin || "ok" in pin)) {
          selection = unavailable("LIVE_PIN_UNAVAILABLE", "步骤标签已过期或没有本次实时授权，请从目标文档重新添加到对话。");
        } else if (!owner) {
          selection = unavailable("LIVE_DOCUMENT_UNAVAILABLE", "当前工作台的实时文档连接不可用，未切换到磁盘编辑。");
        } else {
          selection = owner.captureForManualSend({ threadId: options.threadId, userMessageId: input.userMessageId,
            cwd: input.cwd, mode: input.chatMode === "ask" ? "read" : "edit", pins: selected as LiveProgramDocumentPin[] });
        }
      }
      body = intent ? Object.freeze({ liveProgramDocument: selection, workingDirectory: input.cwd,
        chatMode: input.chatMode, enabledTools: Object.freeze([...input.enabledTools]) }) : undefined;
      stopped = false;
      return body;
    },
    getBody: () => body,
    getGeneration: () => generation,
    isStopped: () => stopped,
    getResult: (operationId: string) => results.get(operationId),
    execute(operationId: string, rawInput: unknown): StructuredToolResult {
      const selected = body?.liveProgramDocument;
      const fail = (code: string, error: string) => formatLocalToolResult({ source: "live_document", operationId,
        code, error, application: "not_applied", persisted: false, retryable: false }, false, error, { retryable: false });
      const input = parseLiveProgramDocumentToolInput(rawInput);
      if (!input) return fail("INVALID_LIVE_DOCUMENT_INPUT", "实时文档工具参数无效。");
      // The registry compares duplicate payloads. Do not let a receipt map alone
      // authorize a different input under a previously applied operation ID.
      if (!selected || selected.state !== "ready" || !owner) {
        return fail(selected?.state === "unavailable" ? selected.code : "LIVE_DOCUMENT_UNAVAILABLE",
          selected?.state === "unavailable" ? selected.error : "没有本轮授权的实时文档，未使用磁盘回退。");
      }
      if (input.scopeId !== selected.scope.scopeId) return fail("LIVE_DOCUMENT_SCOPE_CHANGED", "调用不属于原始消息的实时文档范围，未修改当前文档。");
      const previous = results.get(operationId);
      if (stopped && !previous) return fail("LIVE_DOCUMENT_TURN_STOPPED", "本轮已停止，未修改文档。");
      const receipt = owner.execute(selected.scope, { scopeId: selected.scope.scopeId, operationId, input: input.input }, { isCancelled: () => stopped });
      const result = formatLocalToolResult(receipt, receipt.ok, receipt.ok ? undefined : receipt.error, { retryable: false });
      if (!previous) results.set(operationId, result);
      return result;
    },
    stop: () => revoke("The user stopped the live turn"),
    dispose() { revoke("The Chat owner was disposed"); pins.clear(); },
  };
}

export type LiveProgramDocumentTurn = ReturnType<typeof createLiveProgramDocumentTurn>;
