import {
  getRequestThreadId,
  qkrpcRequestContext,
} from "@/lib/qkrpc-request-context";

type ProgramTurnThreadFlags = {
  actionCreated?: boolean;
  programDataEdited?: boolean;
  programPatched?: boolean;
  docsCallCount?: number;
  createdActionId?: string;
  stepRunnerSearchCount?: number;
  editAfterPatchCount?: number;
};

const programTurnFlagsByThread = new Map<string, ProgramTurnThreadFlags>();

/** Clear per-thread program turn flags at the start of a new user chat turn. */
export function clearProgramTurnFlagsForThread(threadId: string | undefined): void {
  const id = threadId?.trim();
  if (!id) return;
  programTurnFlagsByThread.delete(id);
}

function threadFlags(): ProgramTurnThreadFlags {
  const threadId = getRequestThreadId()?.trim();
  if (!threadId) return {};
  let flags = programTurnFlagsByThread.get(threadId);
  if (!flags) {
    flags = {};
    programTurnFlagsByThread.set(threadId, flags);
  }
  return flags;
}

/** Test helper — clear in-memory per-thread flags. */
export function clearProgramTurnFlagsForTests(threadId?: string): void {
  if (threadId) {
    programTurnFlagsByThread.delete(threadId);
    return;
  }
  programTurnFlagsByThread.clear();
}

export function markProgramPatchedThisTurn(): void {
  const store = qkrpcRequestContext.getStore();
  if (store) {
    store.programPatchedThisTurn = true;
    store.editAfterPatchCountThisTurn = 0;
  }
  const flags = threadFlags();
  flags.programPatched = true;
  flags.editAfterPatchCount = 0;
}

export function wasProgramPatchedThisTurn(): boolean {
  return (
    qkrpcRequestContext.getStore()?.programPatchedThisTurn === true
    || threadFlags().programPatched === true
  );
}

export function markActionCreatedThisTurn(actionId?: string): void {
  const store = qkrpcRequestContext.getStore();
  if (store) {
    store.actionCreatedThisTurn = true;
    if (actionId?.trim()) {
      store.createdActionIdThisTurn = actionId.trim();
    }
  }
  threadFlags().actionCreated = true;
  if (actionId?.trim()) {
    threadFlags().createdActionId = actionId.trim();
  }
}

export function getCreatedActionIdThisTurn(): string | undefined {
  return (
    qkrpcRequestContext.getStore()?.createdActionIdThisTurn?.trim()
    || threadFlags().createdActionId?.trim()
    || undefined
  );
}

export function wasActionCreatedThisTurn(): boolean {
  return (
    qkrpcRequestContext.getStore()?.actionCreatedThisTurn === true
    || threadFlags().actionCreated === true
  );
}

export function markProgramDataEditedThisTurn(): void {
  const store = qkrpcRequestContext.getStore();
  if (store) {
    store.programDataEditedThisTurn = true;
  }
  threadFlags().programDataEdited = true;
}

export function wasProgramDataEditedThisTurn(): boolean {
  return (
    qkrpcRequestContext.getStore()?.programDataEditedThisTurn === true
    || threadFlags().programDataEdited === true
  );
}

/** True when create happened this turn but data.json has not been written yet. */
export function mustWriteDataAfterCreateThisTurn(): boolean {
  return wasActionCreatedThisTurn() && !wasProgramDataEditedThisTurn();
}

/** Increment per-turn docs tool usage (ALS + thread backup). */
export function incrementDocsCallCountThisTurn(): number {
  const store = qkrpcRequestContext.getStore();
  const next = (store?.docsCallCountThisTurn ?? threadFlags().docsCallCount ?? 0) + 1;
  if (store) {
    store.docsCallCountThisTurn = next;
  }
  threadFlags().docsCallCount = next;
  return next;
}

export function getDocsCallCountThisTurn(): number {
  return (
    qkrpcRequestContext.getStore()?.docsCallCountThisTurn
    ?? threadFlags().docsCallCount
    ?? 0
  );
}

/** Increment per-turn step_runner_search usage (ALS + thread backup). */
export function incrementStepRunnerSearchCountThisTurn(): number {
  const store = qkrpcRequestContext.getStore();
  const next = (
    store?.stepRunnerSearchCountThisTurn
    ?? threadFlags().stepRunnerSearchCount
    ?? 0
  ) + 1;
  if (store) {
    store.stepRunnerSearchCountThisTurn = next;
  }
  threadFlags().stepRunnerSearchCount = next;
  return next;
}

export function getStepRunnerSearchCountThisTurn(): number {
  return (
    qkrpcRequestContext.getStore()?.stepRunnerSearchCountThisTurn
    ?? threadFlags().stepRunnerSearchCount
    ?? 0
  );
}

/** Count data.json disk edits after the latest patch this turn. */
export function incrementProgramEditAfterPatchCount(): number {
  if (!wasProgramPatchedThisTurn()) {
    return 0;
  }
  const store = qkrpcRequestContext.getStore();
  const next = (
    store?.editAfterPatchCountThisTurn
    ?? threadFlags().editAfterPatchCount
    ?? 0
  ) + 1;
  if (store) {
    store.editAfterPatchCountThisTurn = next;
  }
  threadFlags().editAfterPatchCount = next;
  return next;
}

/** True when data.json content looks like an empty program body. */
export function isEmptyProgramDataContent(content: string | undefined): boolean {
  if (!content?.trim()) return true;
  return /"steps"\s*:\s*\[\s*\]/.test(content);
}
