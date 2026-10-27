import { readHostBinding, type QkrpcHostBinding } from "./qkrpc-host-binding-contract";
import { parseProgramDocumentSnapshot } from "./action-editor/document/programDocumentWire";

export type SourceBundleResource = Readonly<{ path: string; contentBase64: string }>;
export type SourceBundleDocumentRequest = { mode: "inspect"; dir: string } | {
  mode: "preview" | "save-local";
  dir: string;
  expectedSnapshot: string;
  editorJson: string;
  baselineEditorJson: string;
  resources?: readonly SourceBundleResource[];
};
export type SourceBundleDocument = Readonly<{
  schemaVersion: 1;
  kind: "source-bundle-document";
  mode: "inspect" | "preview" | "save-local";
  projectDirectoryAbsolute: string;
  actionId: string;
  editVersion: string;
  hostBinding: QkrpcHostBinding | null;
  storageIdentity: unknown;
  identityJson: string;
  sourceYaml: string;
  editorJson: string;
  codec: unknown;
  sourceSnapshot: Readonly<{
    revision: string;
    managedRevision: string;
    codecRevision: string;
    files: readonly Readonly<{ path: string; sha256: string; bytes: number }>[];
  }>;
  pending: Readonly<{ status: "clean" | "pending"; comparedTo: "managed-native-checkpoint"; nativeState: "unobserved"; currentBodyHash: string; baselineBodyHash: string }>;
  capabilities: Readonly<{ read: true; preview: boolean; saveLocal: boolean; metadataWrite: false; nativeSync: "unobserved"; snapshotAuthorizesWrite: false }>;
  projection: Readonly<{ format: "quicker.editor-json.v1"; metadataEditable: false; [key: string]: unknown }>;
  /** Optional on older codecs; absence or invalid provenance cannot grant live variable access. */
  variableIdentity?: unknown;
  /** Optional codec row mapping; absence disables step live access, not local save or variables. */
  stepIdentity?: unknown;
  preview?: Readonly<{ sourceYaml: string; normalization: "unchanged-original" | "codec-normalized"; consumedSnapshot: string; consumedBodyHash: string }>;
  saveLocal?: Readonly<{ writtenFiles: readonly string[]; normalization: "unchanged-original" | "codec-normalized"; baselineAdvanced: false }>;
}>;
export type SourceBundleFailure = Readonly<{
  ok: false;
  code: string;
  error: string;
  retryable: false;
  /** Preserve the exact local/host partial or unknown receipt; absence is never success. */
  receipt?: unknown;
}>;
export type SourceBundleDocumentResult = Readonly<{ ok: true; document: SourceBundleDocument }> | SourceBundleFailure;

export function isSourceBundleDocumentPath(path: string): boolean {
  return /(?:^|\/)program\.source\.yaml$/i.test(path.replace(/\\/g, "/"));
}
export function sourceBundleDirectory(path: string): string {
  if (!isSourceBundleDocumentPath(path)) throw new Error("An existing program.source.yaml bundle is required.");
  return path.replace(/\\/g, "/").replace(/(?:^|\/)program\.source\.yaml$/i, "");
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid source document response.");
  return value as Record<string, unknown>;
}
function text(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function normalization(value: unknown): boolean { return value === "unchanged-original" || value === "codec-normalized"; }

/** Validate the port envelope. The editor body remains lossless JSON text; no YAML or CAW mapping lives here. */
export function readSourceBundleDocument(value: unknown): SourceBundleDocument {
  const row = record(value), snapshot = record(row.sourceSnapshot), pending = record(row.pending);
  const capabilities = record(row.capabilities), projection = record(row.projection);
  if (row.schemaVersion !== 1 || row.kind !== "source-bundle-document" || !["inspect", "preview", "save-local"].includes(String(row.mode))
    || !text(row.projectDirectoryAbsolute) || !text(row.actionId) || typeof row.editVersion !== "string"
    || typeof row.identityJson !== "string" || typeof row.sourceYaml !== "string" || typeof row.editorJson !== "string"
    || !text(snapshot.revision) || !text(snapshot.managedRevision) || !text(snapshot.codecRevision)
    || !Array.isArray(snapshot.files) || !snapshot.files.every(file => {
      const entry = record(file); return text(entry.path) && text(entry.sha256) && Number.isSafeInteger(entry.bytes) && Number(entry.bytes) >= 0;
    })
    || !["clean", "pending"].includes(String(pending.status)) || pending.comparedTo !== "managed-native-checkpoint" || pending.nativeState !== "unobserved"
    || !text(pending.currentBodyHash) || !text(pending.baselineBodyHash)
    || capabilities.read !== true || typeof capabilities.preview !== "boolean" || typeof capabilities.saveLocal !== "boolean"
    || capabilities.metadataWrite !== false || capabilities.nativeSync !== "unobserved" || capabilities.snapshotAuthorizesWrite !== false
    || projection.format !== "quicker.editor-json.v1" || projection.metadataEditable !== false) throw new Error("Unsupported source document contract.");
  const binding = row.hostBinding === null ? null : readHostBinding(row.hostBinding);
  if (binding === undefined) throw new Error("Invalid source bundle host identity.");
  if (!Object.hasOwn(row, "storageIdentity") || !row.codec || typeof row.codec !== "object") throw new Error("Source storage/codec identity is missing.");
  parseProgramDocumentSnapshot(row.editorJson);
  if (row.mode === "preview") {
    const preview = record(row.preview);
    if (typeof preview.sourceYaml !== "string" || !normalization(preview.normalization) || !text(preview.consumedSnapshot) || !text(preview.consumedBodyHash)) throw new Error("Invalid source preview receipt.");
  }
  if (row.mode === "save-local") {
    const saved = record(row.saveLocal);
    if (saved.baselineAdvanced !== false || !normalization(saved.normalization) || !Array.isArray(saved.writtenFiles) || !saved.writtenFiles.every(text)) throw new Error("Invalid local source save receipt.");
  }
  return { ...row, hostBinding: binding } as SourceBundleDocument;
}
