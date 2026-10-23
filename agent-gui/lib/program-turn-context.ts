import {
  getRequestThreadId,
  getRequestTurnExecutionState,
} from "@/lib/qkrpc-request-context";
import type { TurnExecutionState } from "@/lib/agent-harness/turn-execution-state";

function activeTurnState(): TurnExecutionState | undefined {
  const state = getRequestTurnExecutionState();
  return state?.closed ? undefined : state;
}

/** Compatibility reset affects only the current owner, never another turn with the same thread. */
export function clearProgramTurnFlagsForThread(threadId: string | undefined): void {
  const id = threadId?.trim();
  if (!id || id !== getRequestThreadId()?.trim()) return;
  clearProgramTurnFlagsForTests();
}

/** Test helper; without an active context there is no shared state to clear. */
export function clearProgramTurnFlagsForTests(threadId?: string): void {
  if (threadId && threadId.trim() !== getRequestThreadId()?.trim()) return;
  const state = activeTurnState();
  if (!state) return;
  delete state.actionCreated;
  delete state.programDataEdited;
  delete state.programPatched;
  delete state.docsCallCount;
  delete state.createdActionId;
  delete state.stepRunnerSearchCount;
  delete state.editAfterPatchCount;
}

export function markProgramPatchedThisTurn(): void {
  const state = activeTurnState();
  if (!state) return;
  state.programPatched = true;
  state.editAfterPatchCount = 0;
}

export function wasProgramPatchedThisTurn(): boolean {
  return activeTurnState()?.programPatched === true;
}

export function markActionCreatedThisTurn(actionId?: string): void {
  const state = activeTurnState();
  if (!state) return;
  state.actionCreated = true;
  if (actionId?.trim()) state.createdActionId = actionId.trim();
}

export function getCreatedActionIdThisTurn(): string | undefined {
  return activeTurnState()?.createdActionId?.trim() || undefined;
}

export function wasActionCreatedThisTurn(): boolean {
  return activeTurnState()?.actionCreated === true;
}

export function markProgramDataEditedThisTurn(): void {
  const state = activeTurnState();
  if (state) state.programDataEdited = true;
}

export function wasProgramDataEditedThisTurn(): boolean {
  return activeTurnState()?.programDataEdited === true;
}

/** True when create happened this turn but data.json has not been written yet. */
export function mustWriteDataAfterCreateThisTurn(): boolean {
  return wasActionCreatedThisTurn() && !wasProgramDataEditedThisTurn();
}

export function incrementDocsCallCountThisTurn(): number {
  const state = activeTurnState();
  if (!state) return 1;
  return state.docsCallCount = (state.docsCallCount ?? 0) + 1;
}

export function getDocsCallCountThisTurn(): number {
  return activeTurnState()?.docsCallCount ?? 0;
}

export function incrementStepRunnerSearchCountThisTurn(): number {
  const state = activeTurnState();
  if (!state) return 1;
  return state.stepRunnerSearchCount = (state.stepRunnerSearchCount ?? 0) + 1;
}

export function getStepRunnerSearchCountThisTurn(): number {
  return activeTurnState()?.stepRunnerSearchCount ?? 0;
}

/** Count data.json disk edits after the latest patch this turn. */
export function incrementProgramEditAfterPatchCount(): number {
  const state = activeTurnState();
  if (!state?.programPatched) return 0;
  return state.editAfterPatchCount = (state.editAfterPatchCount ?? 0) + 1;
}

/** True when data.json content looks like an empty program body. */
export function isEmptyProgramDataContent(content: string | undefined): boolean {
  if (!content?.trim()) return true;
  return /"steps"\s*:\s*\[\s*\]/.test(content);
}
