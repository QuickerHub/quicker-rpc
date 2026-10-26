import type { ProgramDocumentSaveResult } from "./program-document-save";
import { saveProgramDocument as saveLegacyProgramDocument, type ProgramDocumentSaveDependencies } from "./legacy-program-document-storage.server";
import { editSourceBundleDocument } from "./source-bundle-document.server";
import { readActionSourceResult } from "./qkrpc-action-source";

export {
  readProgramDocumentTarget,
  withProgramDocumentWriteOwner,
  type ProgramDocumentSaveDependencies,
} from "./legacy-program-document-storage.server";

/** Format dispatch never infers a writable document from a suffix or creates a legacy mirror. */
export async function saveProgramDocument(value: unknown, dependencies: ProgramDocumentSaveDependencies = {}): Promise<ProgramDocumentSaveResult> {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  if (row?.format === "source-bundle") {
    const source = row.source && typeof row.source === "object" ? row.source as Record<string, unknown> : {};
    const result = await editSourceBundleDocument("save-local", {
      path: row.path, ownerToken: source.ownerToken, expectedSnapshot: source.expectedSnapshot,
      editorJson: row.content, baselineEditorJson: row.expectedContent,
      ...(Object.hasOwn(row, "metadata") ? { metadata: row.metadata } : {}),
      ...(Object.hasOwn(row, "expectedProjectBinding") ? { expectedProjectBinding: row.expectedProjectBinding } : {}),
      ...(Object.hasOwn(row, "resources") ? { resources: row.resources } : {}),
    });
    if (result.ok) return { ok: true, sourceDocument: result.document };
    const receipt = readActionSourceResult(result.receipt);
    const bodyPersisted = result.code === "SOURCE_DOCUMENT_PARTIAL" && Array.isArray(receipt.payload.writtenFiles)
      && receipt.payload.writtenFiles.includes("program.source.yaml");
    return { ok: false, code: result.code, error: result.error, sourceReceipt: result.receipt,
      ...(bodyPersisted ? { persistedParts: { body: true } } : {}) };
  }
  if (row?.format !== undefined && row.format !== "legacy-json") return { ok: false, code: "unsupported_storage_format", error: "Unsupported program document storage format." };
  return saveLegacyProgramDocument(value, dependencies);
}
