"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import dynamic from "next/dynamic";
import { FileEditorCard } from "@/components/chat/FileEditorCard";
import { ActionProjectMetaSummary } from "@/components/workspace/ActionProjectMetaSummary";
import { ActionProjectSyncBar } from "@/components/workspace/ActionProjectSyncBar";
import { ActionProjectToolbar } from "@/components/workspace/ActionProjectToolbar";
import { ProgramProjectDeleteControl } from "@/components/workspace/ProgramProjectDeleteControl";
import { actionProjectDirFromName } from "@/lib/action-project-path-shared";
import {
  actionIdFromDataPath,
  actionProjectInfoPathFromDataPath,
  embeddedSubProgramProjectDirFromDataPath,
  globalSubProgramProjectDirFromDataPath,
  isEmbeddedSubProgramDataPath,
  isGlobalSubProgramDataPath,
} from "@/lib/action-project-data-parse";
import { resolveActionIdFromProject } from "@/lib/action-project-id";
import {
  parseActionProjectInfo,
  type ParsedActionProjectInfo,
} from "@/lib/action-project-info-parse";
import { MAX_READ_CHARS } from "@/lib/workspace-file-helpers";
import { basenamePath } from "@/lib/workspace-file-tool";
import { fetchWorkspaceFile } from "@/lib/workspace-explorer-api";
import type { XProgramPresent } from "@/lib/action-editor/program/xProgramHistory";
import {
  normalizeProgramPresentForEditor,
} from "@/lib/action-editor/program/xProgramHistory";
import {
  fingerprintProgramWire,
  parseProgramWireJson,
  serializeProgramWireJson,
} from "@/lib/action-editor/wire/programWire";
import type { ProgramProjectDeleteKind } from "@/lib/use-program-project-delete";
import { ThemeProvider } from "@/lib/action-editor/shared/ThemeContext";
import "@/components/action-editor/action-editor-theme.css";
import "@/components/action-editor/action-editor.css";
import "@/components/action-editor/action-project-data-editor.css";

const XProgramEditor = dynamic(
  () => import("@/lib/action-editor/program/XProgramEditor"),
  { ssr: false, loading: () => <p className="workspace-explorer-hint">加载动作编辑器…</p> },
);

type EditorTab = "visual" | "source";

export type ActionProjectDataEditorProps = {
  path: string;
  content: string;
  /** When true, content may be an agent slice — editor refetches full file from workspace API. */
  truncated?: boolean;
  totalChars?: number;
  cwd: string;
  onSave: (nextContent: string) => Promise<{ ok: boolean; error?: string }>;
  onSaved?: () => void;
  onSynced?: () => void;
};

function displayTitleFromProjectInfo(
  info: ParsedActionProjectInfo | null,
  projectFolder: string,
): string {
  if (info) {
    if (info.kind === "action") return info.title?.trim() ?? "";
    return (info.name ?? info.title ?? "").trim();
  }
  return projectFolder.trim();
}

export function ActionProjectDataEditor({
  path,
  content,
  truncated = false,
  totalChars,
  cwd,
  onSave,
  onSaved,
  onSynced,
}: ActionProjectDataEditorProps): JSX.Element {
  const [tab, setTab] = useState<EditorTab>("visual");
  const [editorContent, setEditorContent] = useState(content);
  const [contentTruncated, setContentTruncated] = useState(truncated);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [projectInfo, setProjectInfo] = useState<ParsedActionProjectInfo | null>(null);
  const [infoRefreshKey, setInfoRefreshKey] = useState(0);
  const extraTopLevelRef = useRef<Record<string, unknown>>({});
  const baselineRef = useRef("");
  const presentRef = useRef<XProgramPresent>({ steps: [], variables: [] });

  useEffect(() => {
    setEditorContent(content);
    setContentTruncated(truncated);
  }, [content, truncated]);

  useEffect(() => {
    if (!truncated || !cwd.trim()) return;
    let cancelled = false;
    setReloadError(null);
    void (async () => {
      const result = await fetchWorkspaceFile(cwd, path);
      if (cancelled) return;
      if (!result.ok) {
        setReloadError(result.error);
        return;
      }
      setEditorContent(result.content);
      setContentTruncated(result.truncated);
    })();
    return () => {
      cancelled = true;
    };
  }, [cwd, path, truncated]);

  const parsed = useMemo(
    () => parseProgramWireJson(editorContent),
    [editorContent],
  );

  const normalizedPresent = useMemo((): XProgramPresent | null => {
    if (!parsed.ok) return null;
    return normalizeProgramPresentForEditor(parsed.present);
  }, [editorContent, parsed.ok, parsed.ok ? parsed.present : null]);

  const wireBaselineFingerprint = useMemo(() => {
    if (!normalizedPresent) return "";
    return fingerprintProgramWire(normalizedPresent);
  }, [normalizedPresent]);
  const isEmbeddedSubProgram = useMemo(() => isEmbeddedSubProgramDataPath(path), [path]);
  const isGlobalSubProgram = useMemo(() => isGlobalSubProgramDataPath(path), [path]);
  const parentActionId = useMemo(() => actionIdFromDataPath(path), [path]);
  const projectFolder = useMemo(() => {
    const normalized = path.replace(/\\/g, "/");
    const parent = normalized.replace(/\/data\.json$/i, "");
    return basenamePath(parent);
  }, [path]);
  const actionId = useMemo(() => {
    if (isEmbeddedSubProgram || isGlobalSubProgram) return "";
    return resolveActionIdFromProject(projectFolder) ?? "";
  }, [isEmbeddedSubProgram, isGlobalSubProgram, projectFolder]);
  const syncActionId = isEmbeddedSubProgram ? (parentActionId ?? "") : actionId;
  const projectDirectory = useMemo(() => {
    if (isEmbeddedSubProgram) {
      return embeddedSubProgramProjectDirFromDataPath(path);
    }
    if (isGlobalSubProgram) {
      return globalSubProgramProjectDirFromDataPath(path);
    }
    return projectFolder ? actionProjectDirFromName(projectFolder) : undefined;
  }, [isEmbeddedSubProgram, isGlobalSubProgram, path, projectFolder]);
  const syncProjectDirectory = useMemo(() => {
    if (isEmbeddedSubProgram && parentActionId) {
      return actionProjectDirFromName(parentActionId);
    }
    return projectDirectory;
  }, [isEmbeddedSubProgram, parentActionId, projectDirectory]);
  const workspaceContext = useMemo(() => {
    const projectDir = projectDirectory?.trim();
    const activeCwd = cwd.trim();
    if (!projectDir || !activeCwd) return undefined;
    return { cwd: activeCwd, projectDir };
  }, [cwd, projectDirectory]);
  const infoJsonPath = useMemo(() => actionProjectInfoPathFromDataPath(path), [path]);

  useEffect(() => {
    if (!infoJsonPath) {
      setProjectInfo(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await fetchWorkspaceFile(cwd, infoJsonPath);
      if (cancelled) return;
      if (!result.ok) {
        setProjectInfo(null);
        return;
      }
      const parsed = parseActionProjectInfo(result.content);
      setProjectInfo(parsed.ok ? parsed.data : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [cwd, infoJsonPath, infoRefreshKey]);

  const handleSynced = useCallback(() => {
    setInfoRefreshKey((n) => n + 1);
    onSynced?.();
  }, [onSynced]);

  const metaTitle = displayTitleFromProjectInfo(projectInfo, projectFolder);
  const metaDescription = projectInfo?.description?.trim() ?? "";
  const metaIcon = projectInfo?.icon;

  const deleteTarget = useMemo((): {
    kind: ProgramProjectDeleteKind;
    projectPath: string;
    quickerId?: string;
    displayTitle: string;
  } | null => {
    const projectPath = projectDirectory?.trim();
    if (!projectPath) return null;

    const title = metaTitle || projectFolder;

    if (isGlobalSubProgram) {
      const quickerId =
        projectInfo?.id?.trim()
        || projectInfo?.name?.trim()
        || projectFolder.trim()
        || undefined;
      return { kind: "global_subprogram", projectPath, quickerId, displayTitle: title };
    }

    if (isEmbeddedSubProgram) {
      return { kind: "embedded_subprogram", projectPath, displayTitle: title };
    }

    const quickerId =
      actionId.trim()
      || resolveActionIdFromProject(projectFolder)
      || undefined;
    return { kind: "action", projectPath, quickerId, displayTitle: title };
  }, [
    actionId,
    isEmbeddedSubProgram,
    isGlobalSubProgram,
    metaTitle,
    projectDirectory,
    projectFolder,
    projectInfo?.id,
    projectInfo?.name,
  ]);

  useEffect(() => {
    if (!parsed.ok || !normalizedPresent) return;
    extraTopLevelRef.current = parsed.extraTopLevel;
    baselineRef.current = wireBaselineFingerprint;
    presentRef.current = normalizedPresent;
    setDirty(false);
  }, [editorContent, parsed, normalizedPresent, wireBaselineFingerprint]);

  const handlePresentChange = useCallback((present: XProgramPresent, meta: { dirty: boolean }) => {
    presentRef.current = present;
    setDirty((prev) => (prev === meta.dirty ? prev : meta.dirty));
  }, []);

  const handleSave = useCallback(async () => {
    if (!parsed.ok) return;
    setSaving(true);
    setSaveError(null);
    const nextText = serializeProgramWireJson(presentRef.current, extraTopLevelRef.current);
    const result = await onSave(nextText);
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.error ?? "保存失败");
      return;
    }
    baselineRef.current = fingerprintProgramWire(presentRef.current);
    setDirty(false);
    onSaved?.();
  }, [onSave, onSaved, parsed.ok]);

  if (contentTruncated) {
    return (
      <div className="action-project-data-editor">
        <p className="workspace-explorer-hint workspace-explorer-hint--warn">
          data.json 过大，工作区编辑器仅加载前 {MAX_READ_CHARS.toLocaleString()} 个字符
          {totalChars !== undefined
            ? `（文件约 ${totalChars.toLocaleString()} 字符）`
            : ""}
          。请用 Agent 的{" "}
          <code>workspace_program</code>（<code>read_data</code> / <code>edit_data</code>）分片编辑，或在本页「源码
          JSON」查看片段。
        </p>
        {reloadError ? (
          <p className="workspace-explorer-hint workspace-explorer-hint--err">{reloadError}</p>
        ) : null}
        <FileEditorCard path={path} content={editorContent} showHeader={false} fillAvailable />
      </div>
    );
  }

  if (!parsed.ok) {
    return (
      <p className="workspace-explorer-hint workspace-explorer-hint--err">
        无法解析 data.json：{parsed.error}
      </p>
    );
  }

  return (
    <div className="action-project-data-editor">
      <div className="action-project-data-editor-header">
        <ActionProjectMetaSummary
          icon={metaIcon}
          title={metaTitle}
          description={metaDescription}
        />
        {actionId ? (
          <div className="action-project-data-editor-actions">
            <div className="action-project-data-editor-actions-row">
              <ActionProjectToolbar
                actionId={actionId}
                className="action-project-data-editor-toolbar"
              />
              <ActionProjectSyncBar
                cwd={cwd}
                actionId={actionId}
                projectDirectory={projectDirectory}
                className="action-project-data-editor-sync"
                onSynced={handleSynced}
              />
              {deleteTarget ? (
                <ProgramProjectDeleteControl
                  kind={deleteTarget.kind}
                  quickerId={deleteTarget.quickerId}
                  projectPath={deleteTarget.projectPath}
                  cwd={cwd}
                  displayTitle={deleteTarget.displayTitle}
                />
              ) : null}
            </div>
          </div>
        ) : syncActionId ? (
          <div className="action-project-data-editor-actions">
            <div className="action-project-data-editor-actions-row">
              <ActionProjectSyncBar
                cwd={cwd}
                actionId={syncActionId}
                projectDirectory={syncProjectDirectory}
                className="action-project-data-editor-sync"
                onSynced={handleSynced}
              />
              {deleteTarget ? (
                <ProgramProjectDeleteControl
                  kind={deleteTarget.kind}
                  quickerId={deleteTarget.quickerId}
                  projectPath={deleteTarget.projectPath}
                  cwd={cwd}
                  displayTitle={deleteTarget.displayTitle}
                />
              ) : null}
            </div>
          </div>
        ) : deleteTarget ? (
          <div className="action-project-data-editor-actions">
            <div className="action-project-data-editor-actions-row">
              <ProgramProjectDeleteControl
                kind={deleteTarget.kind}
                quickerId={deleteTarget.quickerId}
                projectPath={deleteTarget.projectPath}
                cwd={cwd}
                displayTitle={deleteTarget.displayTitle}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="action-project-data-editor-tabs" role="tablist" aria-label="data.json 视图">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "visual"}
          className={`action-project-data-editor-tab${tab === "visual" ? " active" : ""}`}
          onClick={() => setTab("visual")}
        >
          可视化
          {dirty ? " *" : ""}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "source"}
          className={`action-project-data-editor-tab${tab === "source" ? " active" : ""}`}
          onClick={() => setTab("source")}
        >
          源码 JSON
        </button>
        <div className="action-project-data-editor-tab-actions">
          <button
            type="button"
            className="action-project-data-editor-save"
            disabled={!dirty || saving}
            onClick={() => void handleSave()}
          >
            {saving ? "保存中…" : "保存到工作区"}
          </button>
        </div>
      </div>

      {saveError ? (
        <p className="workspace-explorer-hint workspace-explorer-hint--err">{saveError}</p>
      ) : null}

      {tab === "visual" && normalizedPresent ? (
        <div className="action-project-data-editor-visual x-program-host">
          <ThemeProvider>
            <XProgramEditor
              initialPresent={normalizedPresent}
              baselineFingerprint={wireBaselineFingerprint}
              onPresentChange={handlePresentChange}
              programSurface={isEmbeddedSubProgram ? "subProgram" : "main"}
              workspaceContext={workspaceContext}
            />
          </ThemeProvider>
        </div>
      ) : tab === "source" ? (
        <FileEditorCard path={path} content={editorContent} showHeader={false} fillAvailable />
      ) : null}
    </div>
  );
}
