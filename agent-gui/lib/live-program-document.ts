import type { ActionProjectBinding } from "./action-project-binding";
import type { ProgramDocumentIdentity } from "./action-editor/document/programDocumentSession";
import type { WorkspaceDocumentOwner } from "./workspace-document-instances";
import type { StepRunnerInputContract } from "./step-runner-input-contract";
import type { ProgramDocumentStepInputsRequest } from "./action-editor/document/programDocumentStepInputs";
import type { LiveProgramSourceTarget } from "./live-program-source-target";
import type { ProgramDocumentVariableSelector, ProgramDocumentVariableRead, ProgramDocumentVariableFieldChange } from "./action-editor/document/programDocumentVariableLive";

/** Descriptor only. The existing APDE Session remains the sole editable document/history. */
export type LiveProgramDocumentTarget = Readonly<{
  owner: WorkspaceDocumentOwner;
  /** Identifies the actual APDE Session lifetime, including replacement inside one file owner. */
  sessionId: string;
}> & (Readonly<{ format?: "legacy-json"; identity: Readonly<ProgramDocumentIdentity> & { projectBinding: ActionProjectBinding | null } }>
  | Readonly<{ format: "source-bundle"; identity: Readonly<ProgramDocumentIdentity>; source: LiveProgramSourceTarget }>);

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

export type LiveProgramDocumentInput = Readonly<{ action: "read_live"; stepSchemaFor?: string; variableFor?: ProgramDocumentVariableSelector } | {
  action: "edit_live";
  readOperationId: string;
  expectedRevision: number;
  stepId: string;
  note: string;
} | {
  action: "edit_step_inputs_live";
  readOperationId: string;
  expectedRevision: number;
  stepId: string;
  changes: readonly Readonly<{ key: string; value: string }>[];
} | {
  action: "edit_variable_live"; readOperationId: string; expectedRevision: number;
  surface: string; variableId: string; contractRevision: string;
  changes: readonly ProgramDocumentVariableFieldChange[];
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
  stepInputSchema?: Readonly<{ stepId: string; contract: StepRunnerInputContract; editableInputKeys: readonly string[] }>;
  variable?: ProgramDocumentVariableRead & { rowIdentity?: string };
} & LiveProgramDocumentSnapshot | {
  ok: true; action: "edit_live" | "edit_step_inputs_live" | "edit_variable_live"; applied: true; changed: boolean;
  revisionBefore: number; revisionAfter: number; dirty: boolean; undoable: boolean;
  surface?: string; variableId?: string; changedFields?: readonly string[];
} | {
  ok: false; action: LiveProgramDocumentInput["action"]; code: string; error: string;
  retryable: false; application: "not_applied" | "unknown"; revision?: number;
}>;

export type LiveProgramDocumentEndpointFailure = Readonly<{ ok: false; code: string; error: string; revision?: number }>;
export type LiveProgramDocumentMutationResult = Readonly<{
  ok: true; changed: boolean; revisionBefore: number; revisionAfter: number; dirty: boolean;
}> | LiveProgramDocumentEndpointFailure;
export type LiveProgramDocumentExecutionOptions = Readonly<{
  isCancelled?: () => boolean;
  /** Cancels this pending observer; closing the scope always cancels the underlying read. */
  abortSignal?: AbortSignal;
}>;
/** Endpoint functions reference the existing controller; they do not hold a separate body. */
export type LiveProgramDocumentEndpoint = Readonly<{
  getTarget(): LiveProgramDocumentTarget | undefined;
  flushPendingEdits(): void;
  read(): Readonly<{ ok: true; snapshot: LiveProgramDocumentSnapshot }> | LiveProgramDocumentEndpointFailure;
  /** Private row lifetime: markup or an editor ID alone cannot recreate a previous grant. */
  readStep?(stepId: string): Readonly<{ ok: true; step: Readonly<{ stepId: string; surface: string; runnerKey: string; rowIdentity: string }> }> | LiveProgramDocumentEndpointFailure;
  setStepNote(input: Readonly<{
    expectedRevision: number; expectedIdentity: ProgramDocumentIdentity; stepId: string; note: string;
  }>): LiveProgramDocumentMutationResult;
  readInputContract?(input: { stepRunnerKey: string; controlFieldValue?: string }, signal?: AbortSignal): Promise<StepRunnerInputContract>;
  setStepInputs?(input: ProgramDocumentStepInputsRequest): LiveProgramDocumentMutationResult;
  readVariable?(input: ProgramDocumentVariableSelector): Readonly<{ ok: true; variable: ProgramDocumentVariableRead & { rowIdentity?: string } }> | LiveProgramDocumentEndpointFailure;
  setVariable?(input: ProgramDocumentVariableSelector & { expectedRevision: number; expectedIdentity: ProgramDocumentIdentity;
    contractRevision: string; changes: readonly ProgramDocumentVariableFieldChange[] }): LiveProgramDocumentMutationResult & { changedFields?: readonly string[] };
  dispose?(): void;
}>;

export type LiveProgramDocumentRegistryFailure = Readonly<{ ok: false; code: string; error: string; retryable: false }>;
export type LiveProgramDocumentRegistry = Readonly<{
  register(owner: WorkspaceDocumentOwner, endpoint: LiveProgramDocumentEndpoint): () => void;
  pin(owner: WorkspaceDocumentOwner, tagId: string, stepId: string, threadId: string): LiveProgramDocumentPin | LiveProgramDocumentRegistryFailure;
  pinVariable(owner: WorkspaceDocumentOwner, tagId: string, variable: ProgramDocumentVariableSelector, threadId: string): LiveProgramDocumentPin | LiveProgramDocumentRegistryFailure;
  captureForManualSend(input: Readonly<{
    threadId: string; userMessageId: string; cwd: string; pins: readonly LiveProgramDocumentPin[]; mode: "read" | "edit";
  }>): LiveProgramDocumentSelection;
  /** Synchronous commit + receipt registration; no await can split the mutation from its fact. */
  execute(scope: LiveProgramDocumentScope, command: LiveProgramDocumentCommand, options?: LiveProgramDocumentExecutionOptions): LiveProgramDocumentReceipt;
  executeAsync(scope: LiveProgramDocumentScope, command: LiveProgramDocumentCommand, options?: LiveProgramDocumentExecutionOptions): Promise<LiveProgramDocumentReceipt>;
  revokeScope(scopeId: string, reason?: string): void;
  dispose(): void;
}>;
