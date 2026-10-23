"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  cloneXProgramPresent,
  createInitialXProgramHistoryState,
  normalizeProgramPresentForEditor,
  xProgramHistoryReducer,
  type XProgramHistoryAction,
  type XProgramPresent,
  type XProgramHistoryState,
} from "./xProgramHistory";
import type { XProgramEditorHandle } from "./xProgramEditorHandle";
import type { XProgramEditorControl } from "./programDocumentEditorController";

/** The ref is the live history owner; React renders its latest committed state. */
export function useXProgramEditorHistory(initialPresent: XProgramPresent, control?: XProgramEditorControl) {
  // Controlled surfaces never allocate a second present or undo stack.
  const [history, setHistory] = useState<XProgramHistoryState | null>(() => control ? null : createInitialXProgramHistoryState(initialPresent));
  const historyRef = useRef(history);
  const controlRef = useRef(control);
  controlRef.current = control;

  const dispatch = useCallback((action: XProgramHistoryAction): void => {
    const owned = controlRef.current;
    if (owned) {
      if (action.type === "reset" || action.type === "undo" || action.type === "redo") return;
      const present = owned.getPresent();
      if (action.type === "commitProgram") owned.commit(cloneXProgramPresent(action.present));
      else if (action.type === "commitSteps") owned.commit({ ...present, steps: typeof action.updater === "function" ? action.updater(present.steps) : action.updater });
      else owned.commit({ ...present, variables: typeof action.updater === "function" ? action.updater(present.variables) : action.updater });
      return;
    }
    const next = xProgramHistoryReducer(historyRef.current!, action);
    historyRef.current = next;
    setHistory(next);
  }, []);

  const handle = useMemo<XProgramEditorHandle>(() => ({
    getPresent: () => controlRef.current?.getPresent() ?? cloneXProgramPresent(historyRef.current!.present),
    applyProgram: (present, options) => {
      if (controlRef.current) {
        // A document surface cannot reset or bypass the shared history owner.
        controlRef.current.commit(normalizeProgramPresentForEditor(present));
        return;
      }
      dispatch({
        type: options?.recordUndo === false ? "reset" : "commitProgram",
        present: normalizeProgramPresentForEditor(present),
      });
    },
  }), [dispatch]);

  return { history, historyRef, dispatch, handle, present: control?.getPresent() ?? history!.present };
}
