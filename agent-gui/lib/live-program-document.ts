import type { ActionProjectBinding } from "./action-project-binding";
import type { ProgramDocumentIdentity } from "./action-editor/document/programDocumentSession";
import type { WorkspaceDocumentOwner } from "./workspace-document-instances";

/** Descriptor only. The existing APDE Session remains the sole editable document/history. */
export type LiveProgramDocumentTarget = Readonly<{
  owner: WorkspaceDocumentOwner;
  /** Identifies the actual APDE Session lifetime, including replacement inside one file owner. */
  sessionId: string;
  identity: Readonly<ProgramDocumentIdentity> & { projectBinding: ActionProjectBinding | null };
}>;

/** Minted by a live renderer pin; markup/history is never a grant. */
export type LiveProgramDocumentPin = Readonly<{ pinId: string; tagId: string; threadId: string }>;
export type LiveProgramDocumentScope = Readonly<{
  version: 1;
  scopeId: string;
  threadId: string;
  /** Original manual user message, retained across automatic SDK continuations. */
  userMessageId: string;
  cwd: string;
  mode: "read" | "edit";
  target: LiveProgramDocumentTarget;
}>;
export type LiveProgramDocumentSelection = Readonly<{ state: "none" } | {
  state: "unavailable"; code: string; error: string; retryable: false;
} | { state: "ready"; scope: LiveProgramDocumentScope }>;

export type LiveProgramDocumentInput = Readonly<{ action: "read_live" } | {
  action: "edit_live";
  readOperationId: string;
  expectedRevision: number;
  stepId: string;
  note: string;
}>;
export type LiveProgramDocumentCommand = Readonly<{
  scopeId: string;
  /** Actual SDK toolCallId, supplied by the callback rather than by model input. */
  operationId: string;
  input: LiveProgramDocumentInput;
}>;
export type LiveProgramDocumentStep = Readonly<{ stepId: string; surface: string; runnerKey: string; note: string }>;
export type LiveProgramDocumentSnapshot = Readonly<{
  revision: number;
  dirty: boolean;
  content: string;
  steps: readonly LiveProgramDocumentStep[];
}>;
export type LiveProgramDocumentReceiptTarget = Readonly<{
  ownerKey: string; ownerInstanceId: number; sessionId: string; documentKey: string;
}>;
type ReceiptBase = Readonly<{
  version: 1;
  source: "live_document";
  scopeId: string;
  operationId: string;
  target: LiveProgramDocumentReceiptTarget;
  persisted: false;
}>;
export type LiveProgramDocumentReceipt = ReceiptBase & Readonly<{
  ok: true; action: "read_live"; complete: true;
} & LiveProgramDocumentSnapshot | {
  ok: true; action: "edit_live"; applied: true; changed: boolean;
  revisionBefore: number; revisionAfter: number; dirty: boolean; undoable: boolean;
} | {
  ok: false; action: LiveProgramDocumentInput["action"]; code: string; error: string;
  retryable: false; application: "not_applied" | "unknown"; revision?: number;
}>;

export type LiveProgramDocumentEndpointFailure = Readonly<{ ok: false; code: string; error: string; revision?: number }>;
/** Endpoint functions reference the existing controller; they do not hold a separate body. */
export type LiveProgramDocumentEndpoint = Readonly<{
  getTarget(): LiveProgramDocumentTarget | undefined;
  flushPendingEdits(): void;
  read(): Readonly<{ ok: true; snapshot: LiveProgramDocumentSnapshot }> | LiveProgramDocumentEndpointFailure;
  setStepNote(input: Readonly<{
    expectedRevision: number; expectedIdentity: ProgramDocumentIdentity; stepId: string; note: string;
  }>): Readonly<{
    ok: true; changed: boolean; revisionBefore: number; revisionAfter: number; dirty: boolean;
  }> | LiveProgramDocumentEndpointFailure;
}>;

export type LiveProgramDocumentRegistryFailure = Readonly<{ ok: false; code: string; error: string; retryable: false }>;
export type LiveProgramDocumentRegistry = Readonly<{
  register(owner: WorkspaceDocumentOwner, endpoint: LiveProgramDocumentEndpoint): () => void;
  pin(owner: WorkspaceDocumentOwner, tagId: string, stepId: string, threadId: string): LiveProgramDocumentPin | LiveProgramDocumentRegistryFailure;
  captureForManualSend(input: Readonly<{
    threadId: string; userMessageId: string; cwd: string; pins: readonly LiveProgramDocumentPin[]; mode: "read" | "edit";
  }>): LiveProgramDocumentSelection;
  /** Synchronous commit + receipt registration; no await can split the mutation from its fact. */
  execute(scope: LiveProgramDocumentScope, command: LiveProgramDocumentCommand, options?: Readonly<{ isCancelled?: () => boolean }>): LiveProgramDocumentReceipt;
  revokeScope(scopeId: string, reason?: string): void;
  dispose(): void;
}>;
