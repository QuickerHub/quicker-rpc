"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import type { ActionStep, ActionSubProgram, ActionVariable } from "@/lib/action-editor/types/common";
import { getActionDesignerBackendBaseUrl } from "@/lib/action-editor/shared/actionDesignerBackendBaseUrl";
import { IconControl } from "@/lib/action-editor/shared/IconControl";
import { AD_ICONIFY_SPEC } from "@/lib/action-editor/shared/actionDesignerIconify";
import { isKeyboardInputFocus, isKeyboardInputSurface } from "@/lib/action-editor/shared/keyboardInputSurface";
import { ToastProvider, useToast } from "@/lib/action-editor/shared/ToastContext";
import StepListEditor from "@/lib/action-editor/steps/StepListEditor";
import VariableEditor from "@/lib/action-editor/variables/VariableEditor";
import { useStepParamFileContents } from "@/lib/action-editor/steps/useStepParamFileContents";
import {
  cloneXProgramPresent,
  fingerprintXProgramPresent,
  normalizeProgramPresentForEditor,
  X_PROGRAM_HISTORY_ISOLATE_CLASS,
  type XProgramPresent,
} from "@/lib/action-editor/program/xProgramHistory";

import type { XProgramEditorSurface } from "@/lib/action-editor/program/xProgramEditorSurface";
import type { ActionProjectWorkspaceContext } from "@/lib/action-editor/steps/paramEditors/FormDefEditorDialog";
import type { XProgramEditorHandle } from "./xProgramEditorHandle";
import { useXProgramEditorHistory } from "./useXProgramEditorHistory";
import { useActiveXProgramBridgeOptional } from "./activeXProgramBridge";
import { ownsProgramKeyboardTarget } from "../shared/programKeyboardOwner";
import type { RegisterToolboxInsert } from "../toolbox/toolboxInsertionRegistry";

export type XProgramEditorProps = {
  initialPresent: XProgramPresent;
  onPresentChange?: (present: XProgramPresent, meta: { dirty: boolean }) => void;
  editorTabId?: string;
  onEditorHandleChange?: (handle: XProgramEditorHandle | null) => void;
  /** Kept-alive inactive documents must not handle global shortcuts. */
  active?: boolean;
  baselineFingerprint: string;
  /** Main action body vs embedded subprogram body. */
  programSurface?: XProgramEditorSurface;
  workspaceContext?: ActionProjectWorkspaceContext;
  /** Embedded subPrograms for sys:subprogram step IO / titles. */
  subPrograms?: ActionSubProgram[];
  /** Raw wire JSON for QuickerRpc step summary RPC. */
  embeddedSubProgramsWireJson?: string;
  /** data.json path (or equivalent) — remounts StepListEditor on workspace tab switch. */
  programDocumentKey?: string;
  onPinStepToChat?: (stepId: string) => void;
  registerToolboxInsert?: RegisterToolboxInsert;
};

function XProgramEditorInner({
  initialPresent,
  onPresentChange,
  editorTabId = "main",
  onEditorHandleChange,
  active = true,
  baselineFingerprint,
  programSurface = "main",
  workspaceContext,
  subPrograms = [],
  embeddedSubProgramsWireJson,
  programDocumentKey,
  onPinStepToChat,
  registerToolboxInsert,
}: XProgramEditorProps): JSX.Element {
  const { showToast } = useToast();
  const keyboardOwnerId = useId();
  const editorRootRef = useRef<HTMLDivElement>(null);
  const { history: hist, historyRef: histRef, dispatch, handle } = useXProgramEditorHistory(initialPresent);
  const bridge = useActiveXProgramBridgeOptional();
  const registerEditor = bridge?.registerEditor;
  const unregisterEditor = bridge?.unregisterEditor;

  useLayoutEffect(() => {
    registerEditor?.(editorTabId, handle);
    onEditorHandleChange?.(handle);
    return () => {
      unregisterEditor?.(editorTabId, handle);
      onEditorHandleChange?.(null);
    };
  }, [editorTabId, handle, onEditorHandleChange, registerEditor, unregisterEditor]);

  const backendBaseUrl = useMemo(() => getActionDesignerBackendBaseUrl(), []);
  const initialPresentRef = useRef(initialPresent);
  initialPresentRef.current = initialPresent;

  useEffect(() => {
    dispatch({
      type: "reset",
      present: normalizeProgramPresentForEditor(initialPresentRef.current),
    });
  }, [baselineFingerprint, dispatch]);

  useEffect(() => {
    const present = handle.getPresent();
    const dirty =
      fingerprintXProgramPresent(present) !== baselineFingerprint;
    onPresentChange?.(present, { dirty });
  }, [hist.present, baselineFingerprint, handle, onPresentChange]);

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
      if (!active || event.defaultPrevented) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (!ownsProgramKeyboardTarget(editorRootRef.current, keyboardOwnerId, event.target, document.activeElement)) return;
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
  }, [active, dispatch, histRef, keyboardOwnerId]);

  const canUndo = hist.past.length > 0;
  const canRedo = hist.future.length > 0;
  const [variablesOpen, setVariablesOpen] = useState(false);
  const variableCount = hist.present.variables.length;
  const stepParamFileContents = useStepParamFileContents(hist.present.steps, workspaceContext);

  useEffect(() => {
    if (!active || !variablesOpen) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.key !== "Escape") return;
      event.preventDefault();
      setVariablesOpen(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [active, variablesOpen]);

  return (
    <div
      ref={editorRootRef}
      data-program-keyboard-owner={keyboardOwnerId}
      className={`x-program-editor${variablesOpen ? " x-program-editor--variables-open" : ""}`}
    >
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
        <span className="x-program-editor-toolbar-spacer" aria-hidden />
        <button
          type="button"
          className={`x-program-editor-variables-toggle${variablesOpen ? " x-program-editor-variables-toggle--active" : ""}`}
          title={variablesOpen ? "收起变量" : "编辑变量"}
          aria-label={variablesOpen ? "收起变量面板" : "打开变量面板"}
          aria-expanded={variablesOpen}
          onClick={() => setVariablesOpen((open) => !open)}
        >
          <IconControl
            spec={AD_ICONIFY_SPEC.variableInput}
            size={12}
            resourceBaseUrl={backendBaseUrl}
          />
          <span className="x-program-editor-variables-toggle-label">变量</span>
          {variableCount > 0 ? (
            <span className="x-program-editor-variables-toggle-count">{variableCount}</span>
          ) : null}
        </button>
      </div>
      <div className="x-program-editor-body">
        <div className="x-program-editor-steps">
          <StepListEditor
            active={active}
            keyboardOwnerId={keyboardOwnerId}
            steps={hist.present.steps}
            onCommitSteps={commitSteps}
            variables={hist.present.variables}
            programSurface={programSurface}
            programDocumentKey={programDocumentKey}
            onCommitProgram={(present) =>
              dispatch({ type: "commitProgram", present: cloneXProgramPresent(present) })
            }
            notifyClipboard={(message, variant) =>
              showToast(message, { variant: variant === "error" ? "error" : "info" })
            }
            subPrograms={subPrograms}
            embeddedSubProgramsWireJson={embeddedSubProgramsWireJson}
            workspaceContext={workspaceContext}
            stepParamFileContents={stepParamFileContents}
            onPinStepToChat={onPinStepToChat}
            registerToolboxInsert={registerToolboxInsert}
          />
        </div>

        {variablesOpen ? (
          <>
            <button
              type="button"
              className="x-program-editor-variables-backdrop"
              aria-label="关闭变量面板"
              onClick={() => setVariablesOpen(false)}
            />
            <div
              className="x-program-editor-variables-drawer"
              role="dialog"
              aria-label="变量"
            >
              <div className="x-program-editor-variables-drawer-body">
                <VariableEditor
                  active={active}
                  programSurface={programSurface}
                  variables={hist.present.variables}
                  steps={hist.present.steps}
                  workspaceContext={workspaceContext}
                  stepParamFileContents={stepParamFileContents}
                  onCommitVariables={commitVariables}
                  onCloseDrawer={() => setVariablesOpen(false)}
                  onStepHighlightFilter={(filterText) => {
                    showToast(`步骤高亮筛选（占位）：${filterText}`, {
                      variant: "info",
                    });
                  }}
                />
              </div>
            </div>
          </>
        ) : null}
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
