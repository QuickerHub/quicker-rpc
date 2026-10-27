import { readSourceBundleDocument, type SourceBundleDocument, type SourceBundleDocumentResult, type SourceBundleFailure } from "./source-bundle-document";
import { saveProgramDocumentClient } from "./program-document-save-client";
import type { ProgramDocumentSaveResult } from "./program-document-save";
import type { ProgramDocumentSaveTicket } from "./action-editor/document/programDocumentSession";
import { verifySourceVariableIdentity, type SourceVariableIdentity } from "./source-variable-identity";
import { verifySourceStepIdentity, type SourceStepIdentity } from "./source-step-identity";
import type { LiveProgramSourceTarget } from "./live-program-source-target";

export type SourceBundleClientState = Readonly<{ document?: SourceBundleDocument; ownerToken?: string; error?: string; blocked: boolean }>;
function sameTarget(before: SourceBundleDocument, after: SourceBundleDocument): boolean {
  return before.projectDirectoryAbsolute === after.projectDirectoryAbsolute && before.actionId.toLowerCase() === after.actionId.toLowerCase();
}
function failure(code: string, error: string, receipt?: unknown): SourceBundleFailure { return { ok: false, code, error, retryable: false, ...(receipt === undefined ? {} : { receipt }) }; }
function freezeFacts(value: unknown, seen = new WeakSet<object>()): void {
  if (!value || typeof value !== "object" || seen.has(value) || Object.isFrozen(value)) return;
  seen.add(value); for (const nested of Object.values(value)) freezeFacts(nested, seen); Object.freeze(value);
}
function sameWorkingFiles(before: SourceBundleDocument, after: SourceBundleDocument): boolean {
  const files = (document: SourceBundleDocument) => document.sourceSnapshot.files.filter(file => file.path.startsWith("files/"))
    .map(file => [file.path, file.sha256]).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return before.sourceYaml === after.sourceYaml && JSON.stringify(files(before)) === JSON.stringify(files(after));
}

/** Holds received disk facts and a lease only. The editable body and history live exclusively in APDE. */
export function createSourceBundleDocumentClient(options: { cwd: string; path: string; ownerKey: string; fetcher?: typeof fetch; onChange(state: SourceBundleClientState): void }) {
  const fetcher = options.fetcher ?? fetch;
  const connection = new AbortController();
  let closed = false, state: SourceBundleClientState = { blocked: true };
  let lastSaveReceipt: ProgramDocumentSaveResult | undefined;
  let verifiedMapping: { document: SourceBundleDocument; identity: SourceVariableIdentity; steps?: SourceStepIdentity } | undefined;
  let mappingEpoch = 0, mappingPending = false;
  const invalidateMapping = () => { mappingEpoch++; verifiedMapping = undefined; };
  async function observeMapping(document: SourceBundleDocument) {
    const epoch = ++mappingEpoch;
    const [identity, steps] = await Promise.all([verifySourceVariableIdentity(document).catch(() => undefined), verifySourceStepIdentity(document).catch(() => undefined)]);
    if (closed || mappingEpoch !== epoch) return;
    freezeFacts(identity); freezeFacts(steps); freezeFacts(document);
    verifiedMapping = identity ? { document, identity, steps } : undefined;
  }
  const update = (next: SourceBundleClientState) => { state = Object.freeze(next); if (!closed) options.onChange(state); };
  const capture = () => {
    if (closed || state.blocked || mappingPending || !state.ownerToken || !state.document) throw Error(state.error ?? "源码文档尚未取得可操作的存储 owner，或上次存储操作尚未确认。");
    return { document: state.document, ownerToken: state.ownerToken };
  };
  const current = (ownerToken: string) => !closed && state.ownerToken === ownerToken;
  const block = (ownerToken: string, error: string) => { if (current(ownerToken)) { invalidateMapping(); update({ ...state, blocked: true, error }); } };
  async function post(op: string, body: Record<string, unknown>): Promise<SourceBundleDocumentResult & { receipt?: unknown }> {
    const response = await fetcher("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, cwd: options.cwd, path: options.path, op }), cache: "no-store" });
    const result = await response.json() as SourceBundleDocumentResult & { receipt?: unknown };
    if (!result || typeof result.ok !== "boolean" || (!result.ok && (typeof result.error !== "string" || typeof result.code !== "string"))) throw Error("源码存储回执无效。");
    if (!response.ok && result.ok) throw Error("源码操作未得到成功确认。");
    return result.ok ? { ...result, document: readSourceBundleDocument(result.document) } : result;
  }
  return {
    getState: () => state,
    getLastSaveReceipt: () => lastSaveReceipt,
    getLiveSourceTarget(baselineEditorJson: string): LiveProgramSourceTarget | undefined {
      const mapping = verifiedMapping;
      if (closed || state.blocked || mappingPending || !state.ownerToken || !mapping || mapping.document !== state.document || mapping.document.editorJson !== baselineEditorJson) return;
      return structuredClone({ actionId: mapping.document.actionId, hostBinding: mapping.document.hostBinding, storageIdentity: mapping.document.storageIdentity,
        ownerToken: state.ownerToken, sourceSnapshot: mapping.document.sourceSnapshot, codec: mapping.document.codec, variableIdentity: mapping.identity,
        ...(mapping.steps ? { stepIdentity: mapping.steps } : {}), mappingEpoch });
    },
    async connect(): Promise<void> {
      try {
        const params = new URLSearchParams({ op: "open-source-document", cwd: options.cwd, path: options.path, ownerKey: options.ownerKey });
        const response = await fetcher(`/api/workspace?${params}`, { cache: "no-store", signal: connection.signal });
        if (!response.ok) { const result = await response.json() as SourceBundleFailure; throw Error(result.error ?? "无法打开源码文档。"); }
        if (!response.body) throw Error("源码 owner 通道不可用。");
        const reader = response.body.getReader(), decoder = new TextDecoder(); let pending = "", received = false;
        try {
          while (!closed) {
            const part = await reader.read(); if (part.done) break;
            pending += decoder.decode(part.value, { stream: true });
            for (;;) {
              const end = pending.indexOf("\n"); if (end < 0) break;
              const line = pending.slice(0, end); pending = pending.slice(end + 1); if (!line) continue;
              const message = JSON.parse(line) as { heartbeat?: boolean; ownerKey?: string; path?: string; ownerToken?: string; document?: unknown };
              if (message.heartbeat === true) continue;
              if (received || message.ownerKey !== options.ownerKey || message.path !== options.path || typeof message.ownerToken !== "string" || !message.ownerToken) throw Error("源码 owner 回执不属于原文档。");
              const document = readSourceBundleDocument(message.document);
              if (document.mode !== "inspect") throw Error("源码打开回执格式错误。");
              await observeMapping(document);
              received = true; if (!closed) update({ document, ownerToken: message.ownerToken, blocked: false });
            }
          }
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
        if (!closed) throw Error("源码文档连接已关闭；当前草稿已保留，请重新打开后核对。");
      } catch (error) {
        if (!closed) { invalidateMapping(); update({ ...state, ownerToken: undefined, blocked: true, error: error instanceof Error ? error.message : String(error) }); }
      }
    },
    async preview(content: string, baselineContent: string): Promise<SourceBundleDocumentResult> {
      let captured: ReturnType<typeof capture>;
      try { captured = capture(); } catch (error) { return failure("SOURCE_DOCUMENT_STALE", String(error)); }
      try {
        const result = await post("preview-source-document", { ownerToken: captured.ownerToken, expectedSnapshot: captured.document.sourceSnapshot.revision,
          editorJson: content, baselineEditorJson: baselineContent });
        if (result.ok && (!sameTarget(captured.document, result.document) || result.document.mode !== "preview"
          || result.document.preview?.consumedSnapshot !== captured.document.sourceSnapshot.revision)) return failure("SOURCE_DOCUMENT_RESPONSE_MISMATCH", "源码预览不属于本次原文档。");
        return result;
      } catch (error) { return failure("SOURCE_DOCUMENT_FAILED", error instanceof Error ? error.message : String(error)); }
    },
    async save(ticket: ProgramDocumentSaveTicket): Promise<ProgramDocumentSaveResult> {
      if (typeof ticket.content !== "string" || typeof ticket.baselineContent !== "string" || ticket.metadata !== undefined) {
        return { ok: false, code: "SOURCE_DOCUMENT_REQUEST", error: "源码保存需要原 SaveTicket 正文与基线；根属性只读。" };
      }
      let captured: ReturnType<typeof capture>;
      try { captured = capture(); } catch (error) { return { ok: false, code: "SOURCE_DOCUMENT_STALE", error: String(error) }; }
      let result: ProgramDocumentSaveResult;
      mappingPending = true; invalidateMapping();
      try {
        result = await saveProgramDocumentClient(options.cwd, { format: "source-bundle", path: options.path, content: ticket.content, expectedContent: ticket.baselineContent,
          source: { ownerToken: captured.ownerToken, expectedSnapshot: captured.document.sourceSnapshot.revision } });
        if (!result.ok && (!result.code || ["request_failed", "invalid_response", "aborted"].includes(result.code))) {
          result = { ok: false, code: "WRITE_RESULT_UNKNOWN", error: "保存请求已发出，但浏览器未取得有效回执；当前草稿已保留，请核对源码包，勿重复保存。", sourceReceipt: result };
        }
        if (result.ok) {
          const document = readSourceBundleDocument(result.sourceDocument);
          if (!sameTarget(captured.document, document) || document.mode !== "save-local" || document.editorJson !== ticket.content
            || document.sourceSnapshot.managedRevision !== captured.document.sourceSnapshot.managedRevision
            || document.sourceSnapshot.codecRevision !== captured.document.sourceSnapshot.codecRevision) throw Error("源码保存回执不属于原文档、本次 ticket 或提交基线。");
          result = { ok: true, sourceDocument: document };
          if (current(captured.ownerToken)) await observeMapping(document);
          if (current(captured.ownerToken)) update({ document, ownerToken: captured.ownerToken, blocked: false });
        } else if (["WRITE_RESULT_UNKNOWN", "SOURCE_DOCUMENT_PARTIAL", "SOURCE_SNAPSHOT_CONFLICT", "SOURCE_DOCUMENT_STALE"].includes(result.code ?? "")) block(captured.ownerToken, result.error);
      } catch (error) {
        result = { ok: false, code: "WRITE_RESULT_UNKNOWN", error: `源码保存结果未确认，勿重复保存：${error instanceof Error ? error.message : String(error)}`, sourceReceipt: result! };
        block(captured.ownerToken, result.error);
      }
      lastSaveReceipt = result;
      mappingPending = false;
      return result;
    },
    async sync(): Promise<SourceBundleDocumentResult & { receipt?: unknown }> {
      let captured: ReturnType<typeof capture>;
      try { captured = capture(); } catch (error) { return failure("SOURCE_DOCUMENT_STALE", String(error)); }
      try {
        mappingPending = true; invalidateMapping();
        const result = await post("sync-source-document", { ownerToken: captured.ownerToken, expectedSnapshot: captured.document.sourceSnapshot.revision });
        if (result.ok) {
          if (!sameTarget(captured.document, result.document) || result.document.mode !== "inspect") {
            block(captured.ownerToken, "同步后回执不属于原文档，当前草稿已保留。");
            return failure("SOURCE_SYNC_READBACK_FAILED", "同步后回执不属于原文档，请核对原动作，勿重复提交。", result.receipt);
          }
          if (current(captured.ownerToken)) await observeMapping(result.document);
          if (current(captured.ownerToken)) update({ document: result.document, ownerToken: captured.ownerToken, blocked: !sameWorkingFiles(captured.document, result.document),
            ...(!sameWorkingFiles(captured.document, result.document) ? { error: "同步期间 YAML 或资源已变更，当前草稿已保留，请重新打开核对。" } : {}) });
        } else if (["WRITE_RESULT_UNKNOWN", "SOURCE_CHECKPOINT_FAILED", "SOURCE_SYNC_READBACK_FAILED", "SOURCE_SNAPSHOT_CONFLICT"].includes(result.code)) block(captured.ownerToken, result.error);
        return result;
      } catch (error) {
        const result = failure("WRITE_RESULT_UNKNOWN", `同步结果未确认，勿重复提交：${error instanceof Error ? error.message : String(error)}`);
        block(captured.ownerToken, result.error); return result;
      } finally { mappingPending = false; }
    },
    close() { closed = true; invalidateMapping(); connection.abort(); },
  };
}
export type SourceBundleDocumentClient = ReturnType<typeof createSourceBundleDocumentClient>;
