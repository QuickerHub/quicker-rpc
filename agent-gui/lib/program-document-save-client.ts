import type { ProgramDocumentSaveRequest, ProgramDocumentSaveResult, ProgramDocumentTargetResult } from "./program-document-save";
import { parseActionProjectBinding } from "./action-project-binding";
import { invalidateWorkspaceFileReadCache, normalizeWorkspaceFilePath } from "./workspace-file-read-cache";

export async function readProgramDocumentTargetClient(cwd: string, path: string, signal?: AbortSignal): Promise<ProgramDocumentTargetResult> {
  try {
    const params = new URLSearchParams({ cwd, path, op: "program-document-target" });
    const response = await fetch(`/api/workspace?${params}`, { cache: "no-store", signal });
    const result = await response.json() as ProgramDocumentTargetResult;
    if (!result || typeof result.ok !== "boolean") throw new Error("Invalid document target response.");
    if (!result.ok) return { ok: false, error: typeof result.error === "string" ? result.error : "Document target could not be read.", code: result.code };
    if (!response.ok || typeof result.projectDirectory !== "string") throw new Error("Invalid document target response.");
    const expectedDirectory = normalizeWorkspaceFilePath(path).match(/(?:^|\/)(\.quicker\/actions\/[^/]+)\/data\.json$/i)?.[1];
    if (!expectedDirectory || normalizeWorkspaceFilePath(result.projectDirectory) !== expectedDirectory) throw new Error("Document target response belongs to another project directory.");
    const projectBinding = result.projectBinding === null ? null : parseActionProjectBinding(result.projectBinding, result.projectBinding?.actionId);
    return { ok: true, projectDirectory: result.projectDirectory, projectBinding };
  } catch (error) {
    return { ok: false, code: signal?.aborted ? "aborted" : "identity_read_failed", error: error instanceof Error ? error.message : String(error) };
  }
}

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
