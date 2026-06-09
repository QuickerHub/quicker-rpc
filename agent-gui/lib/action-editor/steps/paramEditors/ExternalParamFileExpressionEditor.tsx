import type { JSX } from "react";
import type { ActionStepParam } from "@/lib/action-editor/types/common";
import { ExpressionEditor } from "../expression/ExpressionEditor";
import type { ActionProjectWorkspaceContext } from "./FormDefEditorDialog";
import {
  useExternalParamFileContent,
  type ExternalParamFileEditorState,
} from "./externalParamFileContent";

export function ExternalParamFileBadge({ state }: { state: ExternalParamFileEditorState }): JSX.Element | null {
  if (!state.isExternalFile || !state.filePath) {
    return null;
  }
  return (
    <div className="step-param-external-file-badge" title={state.filePath}>
      {state.filePath}
      {state.loading ? " · 加载中…" : null}
      {state.saving ? " · 保存中…" : null}
    </div>
  );
}

export function ExternalParamFileStatusHints({ state }: { state: ExternalParamFileEditorState }): JSX.Element | null {
  if (!state.loadError && !state.saveError) {
    return null;
  }
  return (
    <>
      {state.loadError ? (
        <div className="step-param-hint step-param-hint--err">{state.loadError}</div>
      ) : null}
      {state.saveError ? (
        <div className="step-param-hint step-param-hint--err">{state.saveError}</div>
      ) : null}
    </>
  );
}

export type ExternalParamFileExpressionEditorProps = {
  param: ActionStepParam;
  workspace?: ActionProjectWorkspaceContext;
  onChange: (next: ActionStepParam) => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
  maxMultilineHeight?: number;
  onValueModeInput?: () => void;
  /** When true, file badge renders outside the VarOrValue shell (parent handles layout). */
  omitBadge?: boolean;
  /** Reuse loaded file state from parent to avoid duplicate fetches. */
  fileState?: ExternalParamFileEditorState;
};

export function ExternalParamFileExpressionEditor({
  param,
  workspace,
  onChange,
  className,
  placeholder = "",
  multiline = false,
  maxMultilineHeight,
  onValueModeInput,
  omitBadge = false,
  fileState,
}: ExternalParamFileExpressionEditorProps): JSX.Element {
  const internalState = useExternalParamFileContent(param, workspace, onChange);
  const externalFile = fileState ?? internalState;

  const editorShellClass = multiline
    ? "step-param-external-file-editor--multiline"
    : "step-param-external-file-editor--inline";

  return (
    <div className={`step-param-external-file-editor ${editorShellClass}`}>
      {!omitBadge ? <ExternalParamFileBadge state={externalFile} /> : null}
      {!omitBadge ? <ExternalParamFileStatusHints state={externalFile} /> : null}
      <ExpressionEditor
        className={className}
        value={externalFile.editorValue}
        placeholder={externalFile.loading ? "正在读取外部文件…" : placeholder}
        multiline={multiline}
        maxMultilineHeight={maxMultilineHeight}
        onChange={(value) => {
          onValueModeInput?.();
          externalFile.onEditorChange(value);
        }}
      />
    </div>
  );
}

export function useExternalParamFileEditorValue(
  param: ActionStepParam,
  workspace: ActionProjectWorkspaceContext | undefined,
  onChange: (next: ActionStepParam) => void,
): ExternalParamFileEditorState {
  return useExternalParamFileContent(param, workspace, onChange);
}

export type { ExternalParamFileEditorState };

/** Default auto-grow cap for script / multiline step params (px). */
export const STEP_PARAM_SCRIPT_MAX_HEIGHT = 200;
