"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  cloneXProgramPresent,
  createInitialXProgramHistoryState,
  normalizeProgramPresentForEditor,
  xProgramHistoryReducer,
  type XProgramHistoryAction,
  type XProgramPresent,
} from "./xProgramHistory";
import type { XProgramEditorHandle } from "./xProgramEditorHandle";

/** The ref is the live history owner; React renders its latest committed state. */
export function useXProgramEditorHistory(initialPresent: XProgramPresent) {
  const [history, setHistory] = useState(() => createInitialXProgramHistoryState(initialPresent));
  const historyRef = useRef(history);

  const dispatch = useCallback((action: XProgramHistoryAction): void => {
    const next = xProgramHistoryReducer(historyRef.current, action);
    historyRef.current = next;
    setHistory(next);
  }, []);

  const handle = useMemo<XProgramEditorHandle>(() => ({
    getPresent: () => cloneXProgramPresent(historyRef.current.present),
    applyProgram: (present, options) => {
      dispatch({
        type: options?.recordUndo === false ? "reset" : "commitProgram",
        present: normalizeProgramPresentForEditor(present),
      });
    },
  }), [dispatch]);

  return { history, historyRef, dispatch, handle };
}
