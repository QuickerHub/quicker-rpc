import type { ActionProjectBinding } from "./action-project-binding";

export type ProgramDocumentSaveRequest = {
  path: string;
  content: string;
  expectedContent: string;
  metadata?: { content: string; expectedContent: string };
  expectedProjectBinding?: ActionProjectBinding | null;
};

export type ProgramDocumentTargetResult =
  | { ok: true; projectBinding: ActionProjectBinding | null; projectDirectory: string }
  | { ok: false; error: string; code?: string };

export type ProgramDocumentSaveResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      code?: string;
      persistedParts?: { body?: boolean; metadata?: boolean };
    };
