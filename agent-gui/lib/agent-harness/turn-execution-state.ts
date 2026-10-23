import type { QkrpcBoundTarget } from "@/lib/qkrpc-host-binding";

/** Mutable execution facts shared by tools and subagents of one root turn. */
export type TurnExecutionState = {
  closed: boolean;
  actionCreated?: boolean;
  programDataEdited?: boolean;
  programPatched?: boolean;
  docsCallCount?: number;
  createdActionId?: string;
  stepRunnerSearchCount?: number;
  editAfterPatchCount?: number;
  qkrpcConnectivityBlocked?: boolean;
  qkrpcTarget?: QkrpcBoundTarget;
  qkrpcUnverifiedRead?: boolean;
  /** Canonical absolute bundle roots confirmed by this turn's source transport. */
  actionSourceDirectories?: Set<string>;
};

export function createTurnExecutionState(): TurnExecutionState {
  return { closed: false };
}

/** Release facts even if a cancelled asynchronous callback still holds the owner. */
export function disposeTurnExecutionState(state: TurnExecutionState): void {
  for (const key of Object.keys(state) as Array<keyof TurnExecutionState>) {
    if (key !== "closed") delete state[key];
  }
  state.closed = true;
}
