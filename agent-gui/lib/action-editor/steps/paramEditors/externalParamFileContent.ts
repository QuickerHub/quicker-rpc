import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionStepParam } from "@/lib/action-editor/types/common";
import { fetchWorkspaceFile, writeWorkspaceFileApi } from "@/lib/workspace-explorer-api";
import { readWorkspaceFileReadCache } from "@/lib/workspace-file-read-cache";
import type { StepSummaryFileContents } from "@/lib/action-editor/steps/stepSummaryFileRefs";
import type { ActionProjectWorkspaceContext } from "./FormDefEditorDialog";
import { projectRelativeFilePath } from "./formSpecModel";

const FILE_WRITE_DEBOUNCE_MS = 450;

export type ExternalParamFileContentOptions = {
  /** Project-relative files/ paths already loaded by StepListEditor summary prefetch. */
  prefetchedFileContents?: StepSummaryFileContents;
};

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

function resolveInitialExternalFileContent(
  workspace: ActionProjectWorkspaceContext,
  filePath: string,
  prefetchedFileContents?: StepSummaryFileContents,
): string | null {
  const prefetched = prefetchedFileContents?.[filePath];
  if (prefetched != null) {
    return prefetched;
  }
  const absolute = projectRelativeFilePath(workspace.projectDir, filePath);
  return readWorkspaceFileReadCache(workspace.cwd, absolute)?.content ?? null;
}

/** Load files/… content for display; debounced write-back when user edits an external file param. */
export function useExternalParamFileContent(
  param: ActionStepParam,
  workspace: ActionProjectWorkspaceContext | undefined,
  onChange: (next: ActionStepParam) => void,
  options?: ExternalParamFileContentOptions,
): ExternalParamFileEditorState {
  const inlineValue = param.value ?? "";
  const filePath = (param.file ?? "").trim() || null;
  const isExternalFile = Boolean(filePath && !inlineValue && !(param.varKey ?? "").trim());
  const prefetchedFileContents = options?.prefetchedFileContents;

  const initialContent =
    isExternalFile && workspace && filePath
      ? resolveInitialExternalFileContent(workspace, filePath, prefetchedFileContents)
      : null;

  const [fileContent, setFileContent] = useState(() => initialContent ?? "");
  const [loading, setLoading] = useState(() => isExternalFile && initialContent == null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pendingWriteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestContentRef = useRef(initialContent ?? "");
  const userEditedRef = useRef(false);

  useEffect(() => {
    userEditedRef.current = false;
    if (!isExternalFile || !workspace || !filePath) {
      setFileContent("");
      setLoading(false);
      setLoadError(null);
      latestContentRef.current = "";
      return;
    }

    const seeded = resolveInitialExternalFileContent(workspace, filePath, prefetchedFileContents);
    if (seeded != null) {
      setFileContent(seeded);
      latestContentRef.current = seeded;
      setLoading(false);
    } else {
      setLoading(true);
    }
    setLoadError(null);

    let cancelled = false;
    const absolute = projectRelativeFilePath(workspace.projectDir, filePath);
    void (async () => {
      const result = await fetchWorkspaceFile(workspace.cwd, absolute);
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        if (seeded == null) {
          setFileContent("");
        }
        setLoadError(result.error);
        return;
      }
      if (userEditedRef.current) {
        return;
      }
      setFileContent(result.content);
      latestContentRef.current = result.content;
    })();

    return () => {
      cancelled = true;
    };
  }, [isExternalFile, workspace, filePath, prefetchedFileContents]);

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
        userEditedRef.current = true;
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
