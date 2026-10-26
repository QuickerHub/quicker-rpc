import { lstat, realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { readSourceBundleDocument, isSourceBundleDocumentPath, type SourceBundleDocument, type SourceBundleDocumentRequest, type SourceBundleDocumentResult, type SourceBundleFailure } from "./source-bundle-document";
import { claimSourceDocumentOwner, SourceDocumentOwnerError, withSourceDocumentOwner } from "./source-document-owner.server";
import { resolveWorkspacePath, resolveWorkspaceRoot } from "./workspace-fs";
import { resolveWorkspacePathChain } from "./workspace-path-chain";
import { getRequestAbortSignal } from "./qkrpc-request-context";
import { runQkrpc, runQkrpcForToolOnce, runQkrpcSourceDocument, type QkrpcRunResult } from "./qkrpc";
import { readActionSourceResult } from "./qkrpc-action-source";
import type { QkrpcHostBinding } from "./qkrpc-host-binding-contract";

type Dependencies = {
  runDocument?: (request: SourceBundleDocumentRequest, signal?: AbortSignal) => Promise<QkrpcRunResult>;
  runSync?: (args: string[], dryRun: boolean, document: SourceBundleDocument, signal?: AbortSignal) => Promise<QkrpcRunResult>;
};
export type SourceBundleOperation = {
  path: string; ownerToken: string; expectedSnapshot: string;
  editorJson?: string; baselineEditorJson?: string;
};
function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function pathKey(path: string): string { const key = resolve(path); return process.platform === "win32" ? key.toLowerCase() : key; }
function identityKey(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, entry: unknown) => entry && typeof entry === "object" && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : entry);
}
function versionToken(value: unknown): string | undefined {
  if (typeof value !== "string" && (typeof value !== "number" || !Number.isSafeInteger(value))) return;
  const text = String(value);
  return /^\d+$/.test(text) && BigInt(text) > 0n ? BigInt(text).toString() : undefined;
}
function targetKey(document: SourceBundleDocument): string {
  return identityKey([pathKey(document.projectDirectoryAbsolute), document.actionId.toLowerCase(), document.hostBinding, document.storageIdentity])!;
}
export function sourceBundleFailure(error: unknown): SourceBundleFailure {
  if (record(error)?.ok === false) return error as SourceBundleFailure;
  return { ok: false, code: error instanceof SourceDocumentOwnerError ? error.code : "SOURCE_DOCUMENT_FAILED",
    error: error instanceof Error ? error.message : String(error), retryable: false };
}
async function directoryFor(path: string, signal?: AbortSignal): Promise<string> {
  if (!isSourceBundleDocumentPath(path)) throw new SourceDocumentOwnerError("SOURCE_DOCUMENT_PATH", "请选择已有的 program.source.yaml 源码包。");
  const lexical = resolveWorkspacePath(path); if (!lexical.ok) throw new Error(lexical.error);
  const checked = await resolveWorkspacePathChain(resolveWorkspaceRoot(), lexical, { lstat, realpath }, signal);
  if (!checked.ok) throw new SourceDocumentOwnerError("SOURCE_DOCUMENT_PATH", checked.error);
  const stat = await lstat(checked.absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new SourceDocumentOwnerError("SOURCE_DOCUMENT_PATH", "源码必须是工作区内的独立文件。");
  return realpath(dirname(checked.absolute));
}
async function invoke(request: SourceBundleDocumentRequest, dependencies: Dependencies, signal?: AbortSignal): Promise<SourceBundleDocument> {
  const result = await (dependencies.runDocument ?? ((args, abortSignal) => runQkrpcSourceDocument({ ...args }, { abortSignal })))(request, signal);
  const root = record(result.parsed), payload = root?.kind === "source-bundle-document" ? root : record(root?.data);
  if (!result.ok || root?.ok === false || !payload) {
    const failure = readActionSourceResult(result.parsed);
    throw { ok: false, code: failure.errorCode ?? (request.mode === "save-local" ? "WRITE_RESULT_UNKNOWN" : "SOURCE_DOCUMENT_FAILED"),
      error: failure.message ?? result.stderr ?? "源码操作未得到确认。", retryable: false, receipt: result.parsed } satisfies SourceBundleFailure;
  }
  let document: SourceBundleDocument;
  try {
    document = readSourceBundleDocument(payload);
    if (document.mode !== request.mode || pathKey(document.projectDirectoryAbsolute) !== pathKey(request.dir)) throw new Error("源码回执不属于本次目录或操作。");
    if (request.mode === "preview" && (document.sourceSnapshot.revision !== request.expectedSnapshot || document.preview?.consumedSnapshot !== request.expectedSnapshot)) throw new Error("源码预览回执不属于本次快照。");
    if (request.mode === "save-local" && document.editorJson !== request.editorJson) throw new Error("源码保存回执不属于本次文档正文。");
  } catch (error) {
    throw { ok: false, code: request.mode === "save-local" ? "WRITE_RESULT_UNKNOWN" : "SOURCE_DOCUMENT_RESPONSE_MISMATCH",
      error: error instanceof Error ? error.message : String(error), retryable: false, receipt: result.parsed } satisfies SourceBundleFailure;
  }
  return document;
}
function requireOperation(value: unknown): SourceBundleOperation {
  const row = record(value);
  if (!row || typeof row.path !== "string" || typeof row.ownerToken !== "string" || !row.ownerToken
    || typeof row.expectedSnapshot !== "string" || !row.expectedSnapshot) throw new SourceDocumentOwnerError("SOURCE_DOCUMENT_REQUEST", "需要原源码文档的 owner 和完整快照。");
  return row as SourceBundleOperation;
}
function requireCurrentOwner(isCurrent: () => boolean): void {
  if (!isCurrent()) throw new SourceDocumentOwnerError("SOURCE_DOCUMENT_STALE", "原源码文档已关闭，未派发后续操作。");
}
async function currentDocument(request: SourceBundleOperation, directory: string, dependencies: Dependencies, signal?: AbortSignal) {
  const current = await invoke({ mode: "inspect", dir: directory }, dependencies, signal);
  if (current.sourceSnapshot.revision !== request.expectedSnapshot) throw new SourceDocumentOwnerError("SOURCE_SNAPSHOT_CONFLICT", "源码包、资源或提交基线已在外部变更，当前草稿已保留，请重新打开后核对。");
  return current;
}

/** Source catalogs verify the real bundle snapshot and host target; no legacy project sidecar is invented. */
export async function withSourceBundleCatalog<T>(request: SourceBundleOperation, expectedBinding: QkrpcHostBinding | null,
  run: (binding: QkrpcHostBinding) => Promise<T>, signal?: AbortSignal, dependencies: Dependencies = {}): Promise<T> {
  const directory = await directoryFor(request.path, signal);
  return withSourceDocumentOwner(directory, request.ownerToken, async isCurrent => {
    const document = await currentDocument(request, directory, dependencies, signal);
    requireCurrentOwner(isCurrent); signal?.throwIfAborted();
    if (!document.hostBinding || !expectedBinding || identityKey(document.hostBinding) !== identityKey(expectedBinding)) {
      throw new SourceDocumentOwnerError("HOST_BINDING_REQUIRED", "源码包的实际绑定与目录请求不符；不会改查默认宿主。");
    }
    const result = await run(document.hostBinding);
    requireCurrentOwner(isCurrent); signal?.throwIfAborted();
    await currentDocument(request, directory, dependencies, signal);
    return result;
  }, signal);
}

/** The response lifetime is the server-side ownership bridge, including hidden Chats and unblurred drafts. */
export async function openSourceBundleDocumentResponse(req: Request, path: string, ownerKey: string, dependencies: Dependencies = {}): Promise<Response> {
  let lease: Awaited<ReturnType<typeof claimSourceDocumentOwner<SourceBundleDocument>>> | undefined;
  try {
    if (!ownerKey || ownerKey.length > 512) throw new SourceDocumentOwnerError("SOURCE_DOCUMENT_REQUEST", "需要设计器文档实例。");
    const directory = await directoryFor(path, req.signal);
    lease = await claimSourceDocumentOwner(directory, ownerKey, () => invoke({ mode: "inspect", dir: directory }, dependencies, req.signal), req.signal);
    const encoder = new TextEncoder();
    let finish = () => {};
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const release = lease!.release;
        const timer = setInterval(() => { if (!closed) controller.enqueue(encoder.encode('{"heartbeat":true}\n')); }, 25_000);
        finish = () => {
          if (closed) return; closed = true; clearInterval(timer); release(); req.signal.removeEventListener("abort", finish);
          try { controller.close(); } catch { /* The reader may already have cancelled. */ }
        };
        req.signal.addEventListener("abort", finish, { once: true });
        if (req.signal.aborted) { finish(); return; }
        controller.enqueue(encoder.encode(JSON.stringify({ ok: true, ownerKey, path, ownerToken: lease!.token, document: lease!.value }) + "\n"));
      },
      cancel() { finish(); },
    });
    return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (error) { lease?.release(); return Response.json(sourceBundleFailure(error), { status: 409 }); }
}

export async function editSourceBundleDocument(mode: "preview" | "save-local", value: unknown, dependencies: Dependencies = {}): Promise<SourceBundleDocumentResult> {
  try {
    const request = requireOperation(value), row = record(value)!;
    if (typeof request.editorJson !== "string" || typeof request.baselineEditorJson !== "string") throw new SourceDocumentOwnerError("SOURCE_DOCUMENT_REQUEST", "需要本次正文与 SaveTicket 的完整基线正文。");
    if (Object.hasOwn(row, "metadata") || Object.hasOwn(row, "expectedProjectBinding")) throw new SourceDocumentOwnerError("SOURCE_DOCUMENT_READ_ONLY", "此源码包的动作标题、说明、图标和身份元数据只读。");
    const signal = getRequestAbortSignal(), directory = await directoryFor(request.path, signal);
    return await withSourceDocumentOwner(directory, request.ownerToken, async isCurrent => {
      const before = await currentDocument(request, directory, dependencies, signal);
      requireCurrentOwner(isCurrent);
      if (!before.capabilities[mode === "preview" ? "preview" : "saveLocal"]) throw new SourceDocumentOwnerError("SOURCE_DOCUMENT_UNSUPPORTED", "当前源码端口不支持此操作。");
      const document = await invoke({ mode, dir: directory, expectedSnapshot: request.expectedSnapshot,
        editorJson: request.editorJson!, baselineEditorJson: request.baselineEditorJson!,
        ...(Object.hasOwn(row, "resources") ? { resources: row.resources as never } : {}),
      }, dependencies, signal);
      if (targetKey(document) !== targetKey(before) || document.sourceSnapshot.managedRevision !== before.sourceSnapshot.managedRevision
        || document.sourceSnapshot.codecRevision !== before.sourceSnapshot.codecRevision) {
        throw { ok: false, code: mode === "save-local" ? "WRITE_RESULT_UNKNOWN" : "SOURCE_DOCUMENT_RESPONSE_MISMATCH",
          error: "源码目标、提交基线或 codec 在操作期间变化；请核对原目录，勿重复保存。", retryable: false, receipt: document } satisfies SourceBundleFailure;
      }
      return { ok: true, document };
    });
  } catch (error) { return sourceBundleFailure(error); }
}

/** Explicit user Sync only. Offline validation precedes one native commit; partial/unknown facts are retained. */
export async function syncSourceBundleDocument(value: unknown, dependencies: Dependencies = {}): Promise<SourceBundleDocumentResult & { receipt?: unknown }> {
  try {
    const request = requireOperation(value), signal = getRequestAbortSignal(), directory = await directoryFor(request.path, signal);
    return await withSourceDocumentOwner(directory, request.ownerToken, async isCurrent => {
      const before = await currentDocument(request, directory, dependencies, signal);
      requireCurrentOwner(isCurrent);
      if (!before.hostBinding || before.hostBinding.capabilities["action.source.write"] !== true) throw new SourceDocumentOwnerError("HOST_CAPABILITY_UNAVAILABLE", "此源码包没有已声明 source 写入能力的绑定宿主，不能同步。");
      const run = dependencies.runSync ?? ((args, dryRun, document, abortSignal) => dryRun ? runQkrpc(args, { abortSignal })
        : runQkrpcForToolOnce(args, { abortSignal, hostBinding: document.hostBinding! }));
      const args = ["action", "save", "--dir", directory, "--expected-source-snapshot", request.expectedSnapshot];
      const checked = await run([...args, "--dry-run"], true, before, signal);
      const validation = readActionSourceResult(checked.parsed);
      if (!checked.ok || validation.payload.ok !== true || validation.payload.dryRun !== true || validation.payload.persisted === true
        || validation.payload.consumedSnapshot !== request.expectedSnapshot || validation.payload.consumedBodyHash !== before.pending.currentBodyHash
        || typeof validation.payload.actionId !== "string" || validation.payload.actionId.toLowerCase() !== before.actionId.toLowerCase()
        || versionToken(validation.payload.editVersion) !== versionToken(before.editVersion)
        || typeof validation.payload.projectDirectoryAbsolute !== "string" || pathKey(validation.payload.projectDirectoryAbsolute) !== pathKey(directory)) {
        return { ok: false, code: validation.errorCode ?? "SOURCE_VALIDATE_UNCONFIRMED", error: validation.message ?? checked.stderr ?? "源码校验未确认，未派发同步。", retryable: false, receipt: checked.parsed };
      }
      signal?.throwIfAborted();
      requireCurrentOwner(isCurrent);
      let saved: QkrpcRunResult;
      try { saved = await run(args, false, before, signal); }
      catch {
        return { ok: false, code: "WRITE_RESULT_UNKNOWN", error: "同步派发后取消或失去回执，提交结果未确认；请核对原动作，勿重复提交。", retryable: false };
      }
      const result = readActionSourceResult(saved.parsed), receipt = result.payload;
      if (!saved.ok || receipt.persisted !== true || receipt.consumedSnapshot !== request.expectedSnapshot
        || receipt.consumedBodyHash !== before.pending.currentBodyHash || !versionToken(receipt.editVersion)
        || receipt.hostSaveStatus !== "confirmed" || receipt.checkpointStatus !== "updated"
        || typeof receipt.actionId !== "string" || receipt.actionId.toLowerCase() !== before.actionId.toLowerCase()) {
        return { ok: false, code: result.errorCode ?? "WRITE_RESULT_UNKNOWN", error: result.message ?? saved.stderr ?? "同步结果未确认，请核对原动作与源码包，勿重复提交。", retryable: false, receipt: saved.parsed };
      }
      try {
        const document = await invoke({ mode: "inspect", dir: directory }, dependencies, signal);
        const confirmedStorage = Object.hasOwn(receipt, "storageIdentity") ? receipt.storageIdentity
          : before.storageIdentity === null ? null : undefined;
        if (document.actionId.toLowerCase() !== before.actionId.toLowerCase() || !document.hostBinding || identityKey(document.hostBinding) !== identityKey(before.hostBinding)
          || confirmedStorage === undefined || identityKey(document.storageIdentity) !== identityKey(confirmedStorage)
          || versionToken(document.editVersion) !== versionToken(receipt.editVersion)
          || document.pending.baselineBodyHash !== receipt.consumedBodyHash
          || document.sourceSnapshot.codecRevision !== before.sourceSnapshot.codecRevision) throw new Error("同步后源码目标或回执确认的存储身份不符。");
        return { ok: true, document, receipt: saved.parsed };
      } catch (error) {
        return { ok: false, code: "SOURCE_SYNC_READBACK_FAILED", error: "宿主提交已确认，但源码包读回失败；请重新打开核对，勿再次提交。", retryable: false, receipt: { saved: saved.parsed, readback: sourceBundleFailure(error) } };
      }
    });
  } catch (error) { return sourceBundleFailure(error); }
}
