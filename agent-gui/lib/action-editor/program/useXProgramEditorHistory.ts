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
import { prepareProgramVariableChange, type ProgramVariableChangeRequest, type ProgramVariableChangeResult } from "./programVariableReferences";
import { exportProgramVariables, prepareProgramVariablePaste, type ProgramVariableClipboardExportResult, type ProgramVariableClipboardPasteResult } from "./programVariableClipboard";

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

  const changeVariables = useCallback((request: ProgramVariableChangeRequest): ProgramVariableChangeResult => {
    if (controlRef.current !== control) return { ok: false, code: "identity_conflict", error: "编辑文档已切换，请重新核对变量。" };
    if (control) return control.changeVariables(request);
    const prepared = prepareProgramVariableChange(historyRef.current!.present, request);
    if (!prepared.ok) return prepared;
    if (prepared.changed) dispatch({ type: "commitProgram", present: prepared.present });
    return { ok: true, changed: prepared.changed };
  }, [control, dispatch]);

  const exportVariables = useCallback((ids: readonly string[]): ProgramVariableClipboardExportResult => {
    if (controlRef.current !== control) return { ok: false, code: "identity_conflict", error: "编辑文档已切换，请重新复制变量。" };
    return control ? control.exportVariables(ids) : exportProgramVariables(historyRef.current!.present, ids);
  }, [control]);

  const pasteVariables = useCallback((text: string): ProgramVariableClipboardPasteResult => {
    if (controlRef.current !== control) return { ok: false, code: "identity_conflict", error: "编辑文档已切换，请重新粘贴变量。" };
    if (control) return control.pasteVariables(text);
    const prepared = prepareProgramVariablePaste(historyRef.current!.present, text);
    if (!prepared.ok) return prepared;
    if (prepared.changed) dispatch({ type: "commitProgram", present: prepared.present });
    return { ok: true, changed: prepared.changed, insertedIds: prepared.insertedIds };
  }, [control, dispatch]);

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

  return { history, historyRef, dispatch, handle, changeVariables, exportVariables, pasteVariables, present: control?.getPresent() ?? history!.present };
}
