import type { ActionProjectBinding } from "./action-project-binding";
import type { SourceBundleDocument, SourceBundleResource } from "./source-bundle-document";

export type LegacyProgramDocumentSaveRequest = {
  format?: "legacy-json";
  path: string;
  content: string;
  expectedContent: string;
  metadata?: { content: string; expectedContent: string };
  expectedProjectBinding?: ActionProjectBinding | null;
};
export type SourceProgramDocumentSaveRequest = {
  format: "source-bundle";
  path: string;
  content: string;
  expectedContent: string;
  source: { ownerToken: string; expectedSnapshot: string };
  resources?: readonly SourceBundleResource[];
  metadata?: never;
  expectedProjectBinding?: never;
};
export type ProgramDocumentSaveRequest = LegacyProgramDocumentSaveRequest | SourceProgramDocumentSaveRequest;

export type ProgramDocumentTargetResult =
  | { ok: true; projectBinding: ActionProjectBinding | null; projectDirectory: string }
  | { ok: false; error: string; code?: string };

export type ProgramDocumentSaveResult =
  | { ok: true; sourceDocument?: SourceBundleDocument }
  | {
      ok: false;
      error: string;
      code?: string;
      persistedParts?: { body?: boolean; metadata?: boolean };
      sourceReceipt?: unknown;
    };
