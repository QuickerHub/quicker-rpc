import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionStepParam } from "@/lib/action-editor/types/common";
import { fetchWorkspaceFile, writeWorkspaceFileApi } from "@/lib/workspace-explorer-api";
import type { ActionProjectWorkspaceContext } from "./FormDefEditorDialog";
import { projectRelativeFilePath } from "./formSpecModel";

const FILE_WRITE_DEBOUNCE_MS = 450;

export type ExternalParamFileEditorState = {
  editorValue: string;
  isExternalFile: boolean;
  filePath: string | null;
  loading: boolean;
  loadError: string | null;
  saving: boolean;
  saveError: string | null;
  onEditorChange: (value: string) => void;
};

/** Load files/… content for display; debounced write-back when user edits an external file param. */
export function useExternalParamFileContent(
  param: ActionStepParam,
  workspace: ActionProjectWorkspaceContext | undefined,
  onChange: (next: ActionStepParam) => void,
): ExternalParamFileEditorState {
  const inlineValue = param.value ?? "";
  const filePath = (param.file ?? "").trim() || null;
  const isExternalFile = Boolean(filePath && !inlineValue && !(param.varKey ?? "").trim());

  const [fileContent, setFileContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pendingWriteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestContentRef = useRef("");

  useEffect(() => {
    if (!isExternalFile || !workspace || !filePath) {
      setFileContent("");
      setLoading(false);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      const absolute = projectRelativeFilePath(workspace.projectDir, filePath);
      const result = await fetchWorkspaceFile(workspace.cwd, absolute);
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setFileContent("");
        setLoadError(result.error);
        return;
      }
      setFileContent(result.content);
      latestContentRef.current = result.content;
    })();

    return () => {
      cancelled = true;
    };
  }, [isExternalFile, workspace, filePath]);

  useEffect(() => {
    return () => {
      if (pendingWriteRef.current != null) {
        clearTimeout(pendingWriteRef.current);
      }
    };
  }, []);

  const flushFileWrite = useCallback(
    async (content: string): Promise<void> => {
      if (!workspace || !filePath) return;
      setSaving(true);
      setSaveError(null);
      const absolute = projectRelativeFilePath(workspace.projectDir, filePath);
      const result = await writeWorkspaceFileApi(workspace.cwd, absolute, content);
      setSaving(false);
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      latestContentRef.current = content;
    },
    [workspace, filePath],
  );

  const onEditorChange = useCallback(
    (value: string): void => {
      if (isExternalFile && workspace && filePath) {
        setFileContent(value);
        setSaveError(null);
        if (pendingWriteRef.current != null) {
          clearTimeout(pendingWriteRef.current);
        }
        pendingWriteRef.current = setTimeout(() => {
          pendingWriteRef.current = null;
          void flushFileWrite(value);
        }, FILE_WRITE_DEBOUNCE_MS);
        return;
      }
      onChange({ ...param, varKey: "", value, file: undefined });
    },
    [isExternalFile, workspace, filePath, flushFileWrite, onChange, param],
  );

  const editorValue = isExternalFile ? fileContent : inlineValue;

  return {
    editorValue,
    isExternalFile,
    filePath,
    loading: isExternalFile && loading,
    loadError: isExternalFile ? loadError : null,
    saving: isExternalFile && saving,
    saveError: isExternalFile ? saveError : null,
    onEditorChange,
  };
}
