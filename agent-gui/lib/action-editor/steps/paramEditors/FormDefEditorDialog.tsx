"use client";

import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { createPortal } from "react-dom";
import {
  fetchWorkspaceFile,
  writeWorkspaceFileApi,
} from "@/lib/workspace-explorer-api";
import { FormSpecFieldsEditor } from "./FormSpecFieldsEditor";
import type { ActionVariable } from "@/lib/action-editor/types/common";
import {
  createEmptyFormSpec,
  parseFormSpecText,
  projectRelativeFilePath,
  serializeFormSpec,
  suggestFormSpecFileName,
  type FormSpecDocument,
} from "./formSpecModel";

export type ActionProjectWorkspaceContext = {
  cwd: string;
  projectDir: string;
};

export type FormDefEditorSaveResult =
  | { mode: "file"; file: string }
  | { mode: "inline"; value: string };

export type FormDefEditorDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (result: FormDefEditorSaveResult) => void;
  initialFile?: string;
  initialValue?: string;
  workspace?: ActionProjectWorkspaceContext;
  variables?: ActionVariable[];
  forDict?: boolean;
  title?: string;
};

type EditorTab = "visual" | "json";

export function FormDefEditorDialog({
  open,
  onClose,
  onSave,
  initialFile,
  initialValue,
  workspace,
  variables = [],
  forDict = false,
  title = "编辑表单定义",
}: FormDefEditorDialogProps): JSX.Element | null {
  const [tab, setTab] = useState<EditorTab>("visual");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [storageMode, setStorageMode] = useState<"file" | "inline">("inline");
  const [filePath, setFilePath] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [spec, setSpec] = useState<FormSpecDocument>(() => createEmptyFormSpec(forDict));
  const [nativeLocked, setNativeLocked] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoadError(null);
    setSaveError(null);
    setSaving(false);
    setTab("visual");
    setNativeLocked(false);

    const file = initialFile?.trim() ?? "";
    const inline = initialValue?.trim() ?? "";
    const preferFile = Boolean(file && workspace);

    void (async () => {
      setLoading(true);
      try {
        if (preferFile && workspace) {
          const absolute = projectRelativeFilePath(workspace.projectDir, file);
          const result = await fetchWorkspaceFile(workspace.cwd, absolute);
          if (cancelled) return;
          if (!result.ok) {
            setLoadError(result.error);
            setStorageMode("file");
            setFilePath(file);
            setSpec(createEmptyFormSpec(forDict));
            setJsonText("");
            return;
          }
          const parsed = parseFormSpecText(result.content);
          if (!parsed.ok) {
            setLoadError(parsed.error);
            setStorageMode("file");
            setFilePath(file);
            return;
          }
          setStorageMode("file");
          setFilePath(file);
          if (parsed.format === "native") {
            setNativeLocked(true);
            setJsonText(result.content);
            setTab("json");
            return;
          }
          setSpec(parsed.spec);
          setJsonText(serializeFormSpec(parsed.spec));
          return;
        }

        if (inline) {
          const parsed = parseFormSpecText(inline);
          if (cancelled) return;
          if (!parsed.ok) {
            setLoadError(parsed.error);
            setStorageMode("inline");
            setFilePath("");
            setJsonText(inline);
            setTab("json");
            return;
          }
          setStorageMode("inline");
          setFilePath("");
          if (parsed.format === "native") {
            setNativeLocked(true);
            setJsonText(inline);
            setTab("json");
            return;
          }
          setSpec(parsed.spec);
          setJsonText(serializeFormSpec(parsed.spec));
          return;
        }

        if (cancelled) return;
        const empty = createEmptyFormSpec(forDict);
        setStorageMode(workspace ? "file" : "inline");
        setFilePath(workspace ? suggestFormSpecFileName([]) : "");
        setSpec(empty);
        setJsonText(serializeFormSpec(empty));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, initialFile, initialValue, workspace, forDict]);

  const syncJsonFromSpec = useCallback((next: FormSpecDocument) => {
    setSpec(next);
    setJsonText(serializeFormSpec(next));
    setNativeLocked(false);
  }, []);

  const handleApplyJson = useCallback(() => {
    const parsed = parseFormSpecText(jsonText);
    if (!parsed.ok) {
      setSaveError(parsed.error);
      return;
    }
    if (parsed.format === "native") {
      setNativeLocked(true);
      setSaveError(null);
      return;
    }
    setNativeLocked(false);
    setSpec(parsed.spec);
    setJsonText(serializeFormSpec(parsed.spec));
    setSaveError(null);
  }, [jsonText]);

  const handleSave = useCallback(async () => {
    setSaveError(null);

    let content = jsonText;
    if (!nativeLocked) {
      if (tab === "visual") {
        content = serializeFormSpec(spec);
        setJsonText(content);
      } else {
        const parsed = parseFormSpecText(jsonText);
        if (!parsed.ok) {
          setSaveError(parsed.error);
          return;
        }
        if (parsed.format === "native") {
          content = jsonText;
        } else {
          content = serializeFormSpec(parsed.spec);
          setSpec(parsed.spec);
        }
      }
    }

    const trimmedFile = filePath.trim().replace(/\\/g, "/");
    const useFile = storageMode === "file" && trimmedFile.length > 0;

    if (useFile) {
      if (!workspace) {
        setSaveError("未绑定工作区，无法保存外部 form.json 文件");
        return;
      }
      if (!trimmedFile.startsWith("files/") || !trimmedFile.endsWith(".form.json")) {
        setSaveError("外部文件路径须为 files/*.form.json");
        return;
      }
      setSaving(true);
      try {
        const absolute = projectRelativeFilePath(workspace.projectDir, trimmedFile);
        const result = await writeWorkspaceFileApi(workspace.cwd, absolute, content);
        if (!result.ok) {
          setSaveError(result.error);
          return;
        }
        onSave({ mode: "file", file: trimmedFile });
        onClose();
      } finally {
        setSaving(false);
      }
      return;
    }

    onSave({ mode: "inline", value: content.trim() });
    onClose();
  }, [
    filePath,
    jsonText,
    nativeLocked,
    onClose,
    onSave,
    spec,
    storageMode,
    tab,
    workspace,
  ]);

  const canUseFileStorage = Boolean(workspace);
  const dialogSubtitle = useMemo(() => {
    if (storageMode === "file" && filePath.trim()) return filePath.trim();
    if (storageMode === "inline") return "内联 JSON";
    return "";
  }, [filePath, storageMode]);

  if (!open) return null;

  const body = loading ? (
    <div className="form-def-editor-loading">加载表单定义…</div>
  ) : (
    <>
      {loadError ? (
        <p className="workspace-explorer-hint workspace-explorer-hint--err">{loadError}</p>
      ) : null}

      <div className="form-def-editor-toolbar">
        <div className="form-def-editor-toolbar-group" role="tablist" aria-label="表单编辑视图">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "visual"}
            className={`form-def-editor-segment${tab === "visual" ? " active" : ""}`}
            disabled={nativeLocked}
            onClick={() => setTab("visual")}
          >
            可视化
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "json"}
            className={`form-def-editor-segment${tab === "json" ? " active" : ""}`}
            onClick={() => setTab("json")}
          >
            JSON
          </button>
        </div>

        {canUseFileStorage ? (
          <div className="form-def-editor-toolbar-group form-def-editor-storage">
            <div className="form-def-editor-segmented" role="radiogroup" aria-label="存储方式">
              <label className={`form-def-editor-segment${storageMode === "file" ? " active" : ""}`}>
                <input
                  type="radio"
                  name="form-def-storage"
                  checked={storageMode === "file"}
                  onChange={() => setStorageMode("file")}
                />
                <span>外部文件</span>
              </label>
              <label className={`form-def-editor-segment${storageMode === "inline" ? " active" : ""}`}>
                <input
                  type="radio"
                  name="form-def-storage"
                  checked={storageMode === "inline"}
                  onChange={() => setStorageMode("inline")}
                />
                <span>内联</span>
              </label>
            </div>
            {storageMode === "file" ? (
              <input
                className="step-param-control form-def-editor-file-path"
                value={filePath}
                onChange={(event) => setFilePath(event.target.value.replace(/\\/g, "/"))}
                placeholder="files/example.form.json"
                spellCheck={false}
              />
            ) : null}
          </div>
        ) : (
          <span className="form-def-editor-storage-badge">内联 JSON</span>
        )}

        {tab === "json" ? (
          <button type="button" className="form-def-editor-json-apply" onClick={handleApplyJson}>
            解析 JSON
          </button>
        ) : null}
      </div>

      {nativeLocked ? (
        <p className="form-def-editor-native-hint">
          当前为 Quicker 原生表单 JSON（PascalCase）。请在 JSON 视图编辑，或改用外部 qkrpc.form.v1 文件。
        </p>
      ) : null}

      {tab === "visual" && !nativeLocked ? (
        <FormSpecFieldsEditor spec={spec} onChange={syncJsonFromSpec} variables={variables} />
      ) : (
        <textarea
          className="step-param-control step-param-control--multiline form-def-editor-json"
          value={jsonText}
          onChange={(event) => setJsonText(event.target.value)}
          spellCheck={false}
        />
      )}

      {saveError ? (
        <p className="workspace-explorer-hint workspace-explorer-hint--err">{saveError}</p>
      ) : null}
    </>
  );

  return createPortal(
    <div
      className="form-def-editor-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="form-def-editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-def-editor-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="form-def-editor-header">
          <div>
            <h2 id="form-def-editor-title">{title}</h2>
            {dialogSubtitle ? <p className="form-def-editor-subtitle">{dialogSubtitle}</p> : null}
          </div>
          <button type="button" className="step-editor-popup-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="form-def-editor-body">{body}</div>
        <footer className="form-def-editor-footer">
          <button type="button" className="step-editor-popup-btn secondary" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="step-editor-popup-btn primary"
            disabled={loading || saving}
            onClick={() => void handleSave()}
          >
            {saving ? "保存中…" : "确定"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
