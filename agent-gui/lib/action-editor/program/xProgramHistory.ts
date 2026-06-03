import { ActionStep, ActionVariable } from "@/lib/action-editor/types/common";

export const X_PROGRAM_HISTORY_MAX = 80;

/** Mark UI regions where Ctrl+Z/Y must drive program history (controlled patch fields), not native text undo. */
export const X_PROGRAM_HISTORY_ISOLATE_CLASS = "x-program-history-isolate";

export type XProgramPresent = {
  steps: ActionStep[];
  variables: ActionVariable[];
};

type Snapshot = XProgramPresent;

export type XProgramHistoryState = {
  present: XProgramPresent;
  past: Snapshot[];
  future: Snapshot[];
};

export type XProgramHistoryAction =
  | { type: "reset"; present: XProgramPresent }
  | { type: "commitSteps"; updater: ActionStep[] | ((prev: ActionStep[]) => ActionStep[]) }
  | {
      type: "commitVariables";
      updater: ActionVariable[] | ((prev: ActionVariable[]) => ActionVariable[]);
    }
  /** Single undo entry for paste (steps + variables). */
  | { type: "commitProgram"; present: XProgramPresent }
  | { type: "undo" }
  | { type: "redo" };

export function cloneXProgramPresent(p: XProgramPresent): XProgramPresent {
  return {
    steps: p.steps.map((s) => ActionStep.fromPartial(s)),
    variables: p.variables.map((v) => ActionVariable.fromPartial(v))
  };
}

/** Stable fingerprint for comparing editor vs storage (steps + variables only). */
export function fingerprintXProgramPresent(present: XProgramPresent): string {
  const steps = present.steps.map((s) => ActionStep.toJSON(s));
  const variables = present.variables.map((v) => ActionVariable.toJSON(v));
  return JSON.stringify({ steps, variables });
}

function resolveStepsUpdater(
  updater: ActionStep[] | ((prev: ActionStep[]) => ActionStep[]),
  prev: ActionStep[]
): ActionStep[] {
  return typeof updater === "function" ? updater(prev) : updater.map((s) => ActionStep.fromPartial(s));
}

function resolveVariablesUpdater(
  updater: ActionVariable[] | ((prev: ActionVariable[]) => ActionVariable[]),
  prev: ActionVariable[]
): ActionVariable[] {
  return typeof updater === "function"
    ? updater(prev)
    : updater.map((v) => ActionVariable.fromPartial(v));
}

export function createInitialXProgramHistoryState(present: XProgramPresent): XProgramHistoryState {
  return {
    present: cloneXProgramPresent(present),
    past: [],
    future: []
  };
}

export function xProgramHistoryReducer(
  state: XProgramHistoryState,
  action: XProgramHistoryAction
): XProgramHistoryState {
  switch (action.type) {
    case "reset":
      return {
        present: cloneXProgramPresent(action.present),
        past: [],
        future: []
      };
    case "commitSteps": {
      const nextSteps = resolveStepsUpdater(action.updater, state.present.steps);
      return {
        past: [...state.past, cloneXProgramPresent(state.present)].slice(-X_PROGRAM_HISTORY_MAX),
        future: [],
        present: {
          ...state.present,
          steps: nextSteps.map((s) => ActionStep.fromPartial(s))
        }
      };
    }
    case "commitVariables": {
      const nextVariables = resolveVariablesUpdater(action.updater, state.present.variables);
      return {
        past: [...state.past, cloneXProgramPresent(state.present)].slice(-X_PROGRAM_HISTORY_MAX),
        future: [],
        present: {
          ...state.present,
          variables: nextVariables.map((v) => ActionVariable.fromPartial(v))
        }
      };
    }
    case "commitProgram": {
      return {
        past: [...state.past, cloneXProgramPresent(state.present)].slice(-X_PROGRAM_HISTORY_MAX),
        future: [],
        present: cloneXProgramPresent(action.present)
      };
    }
    case "undo": {
      if (state.past.length === 0) {
        return state;
      }
      const prev = state.past[state.past.length - 1]!;
      const newPast = state.past.slice(0, -1);
      const redoSnapshot = cloneXProgramPresent(state.present);
      return {
        present: cloneXProgramPresent(prev),
        past: newPast,
        future: [redoSnapshot, ...state.future].slice(0, X_PROGRAM_HISTORY_MAX)
      };
    }
    case "redo": {
      if (state.future.length === 0) {
        return state;
      }
      const next = state.future[0]!;
      const newFuture = state.future.slice(1);
      const undoSnapshot = cloneXProgramPresent(state.present);
      return {
        present: cloneXProgramPresent(next),
        past: [...state.past, undoSnapshot].slice(-X_PROGRAM_HISTORY_MAX),
        future: newFuture
      };
    }
    default:
      return state;
  }
}
