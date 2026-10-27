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
import type { ResourceCallOrigin } from "../steps/toolboxStepFactory";
import type { XProgramEditorControl } from "./programDocumentEditorController";
import type { ProgramVariableChangeRequest, ProgramVariableChangeResult } from "./programVariableReferences";

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
  onPinVariableToChat?: (variableId: string) => void;
  registerToolboxInsert?: RegisterToolboxInsert;
  resourceCallOrigin?: ResourceCallOrigin;
  control?: XProgramEditorControl;
  keyboardOwnerId?: string;
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
  onPinVariableToChat,
  registerToolboxInsert,
  resourceCallOrigin,
  control,
  keyboardOwnerId: documentKeyboardOwnerId,
}: XProgramEditorProps): JSX.Element {
  const { showToast } = useToast();
  const localKeyboardOwnerId = useId();
  const keyboardOwnerId = documentKeyboardOwnerId ?? localKeyboardOwnerId;
  const editorRootRef = useRef<HTMLDivElement>(null);
  const { history: hist, historyRef: histRef, dispatch, handle: stateHandle, changeVariables, exportVariables, pasteVariables, exportSteps, pasteSteps, present } = useXProgramEditorHistory(initialPresent, control);
  const variableOwner = useMemo(() => ({}), [control, editorTabId, programDocumentKey, workspaceContext?.cwd, workspaceContext?.projectDir]);
  const currentVariableOwner = useRef<object | null>(variableOwner);
  currentVariableOwner.current = variableOwner;
  useLayoutEffect(() => { currentVariableOwner.current = variableOwner; return () => { currentVariableOwner.current = null; }; }, [variableOwner]);
  const onVariableChange = useCallback((request: ProgramVariableChangeRequest): ProgramVariableChangeResult => {
    if (currentVariableOwner.current !== variableOwner) return { ok: false, code: "identity_conflict", error: "编辑文档已切换，请重新核对变量。" };
    return changeVariables(request);
  }, [changeVariables, variableOwner]);
  const draftFlushers = useRef(new Set<() => boolean | void>());
  const liveEditingBlockers = useRef(new Set<() => boolean>());
  const registerDraftFlusher = useCallback((flush: () => boolean | void) => {
    draftFlushers.current.add(flush);
    return () => { draftFlushers.current.delete(flush); };
  }, []);
  const registerLiveEditingBlocker = useCallback((isBlocked: () => boolean) => {
    liveEditingBlockers.current.add(isBlocked);
    return () => { liveEditingBlockers.current.delete(isBlocked); };
  }, []);
  const handle = useMemo<XProgramEditorHandle>(() => ({ ...stateHandle,
    flushPendingEdits: () => { for (const flush of draftFlushers.current) if (flush() === false) return false; return true; },
    isLiveEditingBlocked: () => [...liveEditingBlockers.current].some((isBlocked) => isBlocked()),
  }), [stateHandle]);
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
    if (control) return;
    dispatch({
      type: "reset",
      present: normalizeProgramPresentForEditor(initialPresentRef.current),
    });
  }, [baselineFingerprint, dispatch, control]);

  useEffect(() => {
    if (control) return;
    const present = handle.getPresent();
    const dirty =
      fingerprintXProgramPresent(present) !== baselineFingerprint;
    onPresentChange?.(present, { dirty });
  }, [present, baselineFingerprint, handle, onPresentChange, control]);

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
      if (control || !active || event.defaultPrevented) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (!ownsProgramKeyboardTarget(editorRootRef.current, keyboardOwnerId, event.target, document.activeElement)) return;
      const t = event.target;
      const inHistoryIsolate =
        t instanceof HTMLElement && t.closest(`.${X_PROGRAM_HISTORY_ISOLATE_CLASS}`) != null;
      if (t && !inHistoryIsolate) {
        if (isKeyboardInputSurface(t) || isKeyboardInputFocus()) return;
      }
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      if (handle.flushPendingEdits?.() === false) { event.preventDefault(); return; }
      const h = histRef.current;
      if (key === "z" && !event.shiftKey) {
        if (!h || h.past.length === 0) {
          if (inHistoryIsolate) event.preventDefault();
          return;
        }
        event.preventDefault();
        dispatch({ type: "undo" });
        return;
      }
      if (key === "y" || (key === "z" && event.shiftKey)) {
        if (!h || h.future.length === 0) {
          if (inHistoryIsolate) event.preventDefault();
          return;
        }
        event.preventDefault();
        dispatch({ type: "redo" });
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [active, control, dispatch, handle, histRef, keyboardOwnerId]);

  const canUndo = (hist?.past.length ?? 0) > 0;
  const canRedo = (hist?.future.length ?? 0) > 0;
  const [variablesOpen, setVariablesOpen] = useState(false);
  const variableCount = present.variables.length;
  const stepParamFileContents = useStepParamFileContents(present.steps, workspaceContext);

  useEffect(() => {
    if (!active || !variablesOpen) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.key !== "Escape") return;
      event.preventDefault();
      if (handle.flushPendingEdits?.() === false) return;
      setVariablesOpen(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [active, handle, variablesOpen]);

  return (
    <div
      ref={editorRootRef}
      data-program-keyboard-owner={keyboardOwnerId}
      className={`x-program-editor${variablesOpen ? " x-program-editor--variables-open" : ""}`}
    >
      <div className="x-program-editor-toolbar" role="toolbar" aria-label="程序编辑">
        {!control ? <>
        <button
          type="button"
          className="variable-toolbar-btn"
          title="撤销 (Ctrl+Z)"
          disabled={!canUndo}
          onClick={() => { if (handle.flushPendingEdits?.() !== false) dispatch({ type: "undo" }); }}
        >
          <IconControl spec={AD_ICONIFY_SPEC.undo} size={12} resourceBaseUrl={backendBaseUrl} />
        </button>
        <button
          type="button"
          className="variable-toolbar-btn"
          title="重做 (Ctrl+Y / Ctrl+Shift+Z)"
          disabled={!canRedo}
          onClick={() => { if (handle.flushPendingEdits?.() !== false) dispatch({ type: "redo" }); }}
        >
          <IconControl spec={AD_ICONIFY_SPEC.redo} size={12} resourceBaseUrl={backendBaseUrl} />
        </button>
        <span className="x-program-editor-toolbar-hint">步骤与变量共用一条撤销/重做历史</span>
        </> : null}
        <span className="x-program-editor-toolbar-spacer" aria-hidden />
        <button
          type="button"
          className={`x-program-editor-variables-toggle${variablesOpen ? " x-program-editor-variables-toggle--active" : ""}`}
          title={variablesOpen ? "收起变量" : "编辑变量"}
          aria-label={variablesOpen ? "收起变量面板" : "打开变量面板"}
          aria-expanded={variablesOpen}
          onClick={() => { if (!variablesOpen || handle.flushPendingEdits?.() !== false) setVariablesOpen(!variablesOpen); }}
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
            clipboardOwner={variableOwner}
            onExportStepsClipboard={exportSteps}
            onPasteStepsClipboard={pasteSteps}
            keyboardOwnerId={keyboardOwnerId}
            steps={present.steps}
            onCommitSteps={commitSteps}
            variables={present.variables}
            registerDraftFlusher={registerDraftFlusher}
            registerLiveEditingBlocker={registerLiveEditingBlocker}
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
            resourceCallOrigin={resourceCallOrigin}
            readProgramPresent={handle.getPresent}
            flushProgramEdits={handle.flushPendingEdits}
          />
        </div>

        {variablesOpen ? (
          <>
            <button
              type="button"
              className="x-program-editor-variables-backdrop"
              aria-label="关闭变量面板"
              onClick={() => { if (handle.flushPendingEdits?.() !== false) setVariablesOpen(false); }}
            />
            <div
              className="x-program-editor-variables-drawer"
              role="dialog"
              aria-label="变量"
            >
              <div className="x-program-editor-variables-drawer-body">
                <VariableEditor
                  active={active}
                  onPinVariableToChat={onPinVariableToChat}
                  programSurface={programSurface}
                  variables={present.variables}
                  registerDraftFlusher={registerDraftFlusher}
                  registerLiveEditingBlocker={registerLiveEditingBlocker}
                  owner={variableOwner}
                  getCurrentPresent={stateHandle.getPresent}
                  onVariableChange={onVariableChange}
                  exportVariables={exportVariables}
                  pasteVariables={pasteVariables}
                  onCommitVariables={commitVariables}
                  onCloseDrawer={() => { if (handle.flushPendingEdits?.() !== false) setVariablesOpen(false); }}
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
