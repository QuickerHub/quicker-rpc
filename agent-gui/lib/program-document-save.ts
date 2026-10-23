export type ProgramDocumentSaveRequest = {
  path: string;
  content: string;
  expectedContent: string;
  metadata?: { content: string; expectedContent: string };
};

export type ProgramDocumentSaveResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      code?: string;
      persistedParts?: { body?: boolean; metadata?: boolean };
    };
