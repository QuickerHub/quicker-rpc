import type { ProgramDocumentSaveRequest, ProgramDocumentSaveResult } from "./program-document-save";
import { invalidateWorkspaceFileReadCache, normalizeWorkspaceFilePath } from "./workspace-file-read-cache";

export async function saveProgramDocumentClient(
  cwd: string,
  request: ProgramDocumentSaveRequest,
  options?: { abortSignal?: AbortSignal },
): Promise<ProgramDocumentSaveResult> {
  try {
    options?.abortSignal?.throwIfAborted();
    const response = await fetch("/api/workspace", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, cwd, op: "save-program-document" }), signal: options?.abortSignal,
    });
    const result = await response.json() as ProgramDocumentSaveResult;
    if (!result || typeof result.ok !== "boolean" || (!result.ok && typeof result.error !== "string")) return { ok: false, code: "invalid_response", error: "Invalid program document save response." };
    if (result.ok || result.persistedParts?.body || result.persistedParts?.metadata) {
      const path = normalizeWorkspaceFilePath(request.path);
      invalidateWorkspaceFileReadCache(cwd, path);
      invalidateWorkspaceFileReadCache(cwd, path.replace(/data\.json$/i, "info.json"));
    }
    return result;
  } catch (error) {
    return { ok: false, code: options?.abortSignal?.aborted ? "aborted" : "request_failed", error: error instanceof Error ? error.message : String(error) };
  }
}
