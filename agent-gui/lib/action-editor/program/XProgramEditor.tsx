"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type JSX,
} from "react";
import type { ActionStep, ActionVariable } from "@/lib/action-editor/types/common";
import { getActionDesignerBackendBaseUrl } from "@/lib/action-editor/shared/actionDesignerBackendBaseUrl";
import { IconControl } from "@/lib/action-editor/shared/IconControl";
import { AD_ICONIFY_SPEC } from "@/lib/action-editor/shared/actionDesignerIconify";
import { isKeyboardInputFocus, isKeyboardInputSurface } from "@/lib/action-editor/shared/keyboardInputSurface";
import { ToastProvider, useToast } from "@/lib/action-editor/shared/ToastContext";
import StepListEditor from "@/lib/action-editor/steps/StepListEditor";
import VariableEditor from "@/lib/action-editor/variables/VariableEditor";
import {
  cloneXProgramPresent,
  createInitialXProgramHistoryState,
  X_PROGRAM_HISTORY_ISOLATE_CLASS,
  xProgramHistoryReducer,
  type XProgramPresent,
} from "@/lib/action-editor/program/xProgramHistory";
import { normalizeLoadedProgramBodyIds } from "@/lib/action-editor/program/normalizeLoadedProgramBodyIds";

import type { XProgramEditorSurface } from "@/lib/action-editor/program/xProgramEditorSurface";
import type { ActionProjectWorkspaceContext } from "@/lib/action-editor/steps/paramEditors/FormDefEditorDialog";

export type XProgramEditorProps = {
  initialPresent: XProgramPresent;
  onPresentChange?: (present: XProgramPresent, meta: { dirty: boolean }) => void;
  baselineFingerprint: string;
  /** Main action body vs embedded subprogram body. */
  programSurface?: XProgramEditorSurface;
  workspaceContext?: ActionProjectWorkspaceContext;
};

function XProgramEditorInner({
  initialPresent,
  onPresentChange,
  baselineFingerprint,
  programSurface = "main",
  workspaceContext,
}: XProgramEditorProps): JSX.Element {
  const { showToast } = useToast();
  const [hist, dispatch] = useReducer(
    xProgramHistoryReducer,
    initialPresent,
    createInitialXProgramHistoryState,
  );
  const histRef = useRef(hist);
  histRef.current = hist;

  const backendBaseUrl = useMemo(() => getActionDesignerBackendBaseUrl(), []);

  useEffect(() => {
    const cloned = cloneXProgramPresent(initialPresent);
    normalizeLoadedProgramBodyIds(cloned.steps, cloned.variables);
    dispatch({ type: "reset", present: cloned });
  }, [baselineFingerprint, initialPresent]);

  useEffect(() => {
    const present = hist.present;
    const fp = JSON.stringify({
      steps: present.steps.map((s) => JSON.stringify(s)),
      variables: present.variables.map((v) => JSON.stringify(v)),
    });
    onPresentChange?.(present, { dirty: fp !== baselineFingerprint });
  }, [hist.present, baselineFingerprint, onPresentChange]);

  const commitSteps = useCallback((updater: ActionStep[] | ((prev: ActionStep[]) => ActionStep[])) => {
    dispatch({ type: "commitSteps", updater });
  }, []);

  const commitVariables = useCallback(
    (updater: ActionVariable[] | ((prev: ActionVariable[]) => ActionVariable[])) => {
      dispatch({ type: "commitVariables", updater });
    },
    [],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const t = event.target;
      const inHistoryIsolate =
        t instanceof HTMLElement && t.closest(`.${X_PROGRAM_HISTORY_ISOLATE_CLASS}`) != null;
      if (t && !inHistoryIsolate) {
        if (isKeyboardInputSurface(t) || isKeyboardInputFocus()) return;
      }
      const key = event.key.toLowerCase();
      const h = histRef.current;
      if (key === "z" && !event.shiftKey) {
        if (h.past.length === 0) {
          if (inHistoryIsolate) event.preventDefault();
          return;
        }
        event.preventDefault();
        dispatch({ type: "undo" });
        return;
      }
      if (key === "y" || (key === "z" && event.shiftKey)) {
        if (h.future.length === 0) {
          if (inHistoryIsolate) event.preventDefault();
          return;
        }
        event.preventDefault();
        dispatch({ type: "redo" });
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const canUndo = hist.past.length > 0;
  const canRedo = hist.future.length > 0;

  return (
    <div className="x-program-editor">
      <div className="x-program-editor-toolbar" role="toolbar" aria-label="程序编辑">
        <button
          type="button"
          className="variable-toolbar-btn"
          title="撤销 (Ctrl+Z)"
          disabled={!canUndo}
          onClick={() => dispatch({ type: "undo" })}
        >
          <IconControl spec={AD_ICONIFY_SPEC.undo} size={12} resourceBaseUrl={backendBaseUrl} />
        </button>
        <button
          type="button"
          className="variable-toolbar-btn"
          title="重做 (Ctrl+Y / Ctrl+Shift+Z)"
          disabled={!canRedo}
          onClick={() => dispatch({ type: "redo" })}
        >
          <IconControl spec={AD_ICONIFY_SPEC.redo} size={12} resourceBaseUrl={backendBaseUrl} />
        </button>
        <span className="x-program-editor-toolbar-hint">步骤与变量共用一条撤销/重做历史</span>
      </div>
      <div className="x-program-editor-steps">
        <StepListEditor
          steps={hist.present.steps}
          onCommitSteps={commitSteps}
          variables={hist.present.variables}
          programSurface={programSurface}
          onCommitProgram={(present) =>
            dispatch({ type: "commitProgram", present: cloneXProgramPresent(present) })
          }
          notifyClipboard={(message, variant) =>
            showToast(message, { variant: variant === "error" ? "error" : "info" })
          }
          subPrograms={[]}
          workspaceContext={workspaceContext}
        />
      </div>
      <div className="x-program-editor-variables">
        <VariableEditor
          programSurface={programSurface}
          variables={hist.present.variables}
          steps={hist.present.steps}
          onCommitVariables={commitVariables}
          onStepHighlightFilter={(filterText) => {
            showToast(`步骤高亮筛选（占位）：${filterText}`, { variant: "info" });
          }}
        />
      </div>
    </div>
  );
}

export default function XProgramEditor(props: XProgramEditorProps): JSX.Element {
  return (
    <ToastProvider>
      <XProgramEditorInner {...props} />
    </ToastProvider>
  );
}

export type { XProgramPresent };
