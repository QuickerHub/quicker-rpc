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
import { chatComposerActionsRef } from "@/lib/chat-composer-bridge";
import { resolveNodePath } from "@/lib/action-editor/program/resolveNodePath";
import { computeProgramStepDiskSlice } from "@/lib/action-editor/program/stepDiskSlice";
import { findStepById } from "@/lib/action-editor/steps/stepTreeOps";
import {
  createProgramStepTag,
  type ProgramStepTarget,
} from "@/lib/program-step-tag";
import {
  parseActionProjectInfo,
  type ParsedActionProjectInfo,
} from "@/lib/action-project-info-parse";
import {
  buildActionProjectSourceFileTabs,
  type ActionProjectSourceFileTab,
} from "@/lib/action-project-source-files";
import { MAX_READ_CHARS } from "@/lib/workspace-file-helpers";
import { basenamePath } from "@/lib/workspace-file-tool";
import { fetchWorkspaceFile, fetchWorkspaceFileList } from "@/lib/workspace-explorer-api";
import type { ActionSubProgram } from "@/lib/action-editor/types/common";
import type { XProgramPresent } from "@/lib/action-editor/program/xProgramHistory";
import {
  fetchGlobalSubProgramCatalog,
  mergeSubProgramsForStepEditor,
} from "@/lib/action-editor/subprograms/globalSubProgramCatalog";
import {
  normalizeProgramPresentForEditor,
} from "@/lib/action-editor/program/xProgramHistory";
import {
  fingerprintProgramWire,
  parseProgramWireJson,
  parseWireSubPrograms,
  serializeProgramWireJson,
  serializeWireSubProgramsJson,
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

type SourceFilePreview = {
  content: string;
  truncated: boolean;
  totalChars?: number;
  error?: string;
  loading: boolean;
};

function normalizeWorkspacePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function ActionProjectSourceFileTabs({
  tabs,
  activePath,
  onSelect,
}: {
  tabs: ActionProjectSourceFileTab[];
  activePath: string;
  onSelect: (path: string) => void;
}): JSX.Element | null {
  if (tabs.length <= 1) return null;

  const normalizedActive = normalizeWorkspacePath(activePath);

  return (
    <div
      className="action-project-data-editor-subtabs"
      role="tablist"
      aria-label="项目文件"
    >
      {tabs.map((fileTab) => {
        const normalizedPath = normalizeWorkspacePath(fileTab.path);
        const isActive = normalizedPath === normalizedActive;
        return (
          <button
            key={normalizedPath}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`action-project-data-editor-subtab${isActive ? " active" : ""}`}
            onClick={() => onSelect(normalizedPath)}
            title={fileTab.path}
          >
            {fileTab.label}
          </button>
        );
      })}
    </div>
  );
}

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
  const [sourceFileTab, setSourceFileTab] = useState(() => normalizeWorkspacePath(path));
  const [sourceFileTabs, setSourceFileTabs] = useState<ActionProjectSourceFileTab[]>([]);
  const [sourceFilePreviews, setSourceFilePreviews] = useState<
    Record<string, SourceFilePreview>
  >({});
  const [editorContent, setEditorContent] = useState(content);
  const [contentTruncated, setContentTruncated] = useState(truncated);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [hasSavedLocalChanges, setHasSavedLocalChanges] = useState(false);
  const [projectInfo, setProjectInfo] = useState<ParsedActionProjectInfo | null>(null);
  const [infoRefreshKey, setInfoRefreshKey] = useState(0);
  const extraTopLevelRef = useRef<Record<string, unknown>>({});
  const baselineRef = useRef("");
  const presentRef = useRef<XProgramPresent>({ steps: [], variables: [] });
  const sourceFetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setEditorContent(content);
    setContentTruncated(truncated);
    setSourceFileTab(normalizeWorkspacePath(path));
    setSourceFilePreviews({});
    sourceFetchedRef.current = new Set();
  }, [content, truncated, path]);

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
  const embeddedSubPrograms = useMemo(() => {
    if (!parsed.ok) return [];
    return parseWireSubPrograms(parsed.extraTopLevel.subPrograms);
  }, [parsed]);
  const embeddedSubProgramsWireJson = useMemo(() => {
    if (!parsed.ok) return undefined;
    return serializeWireSubProgramsJson(parsed.extraTopLevel.subPrograms);
  }, [parsed]);
  const [globalCatalogSubPrograms, setGlobalCatalogSubPrograms] = useState<ActionSubProgram[]>([]);
  const isEmbeddedSubProgram = useMemo(() => isEmbeddedSubProgramDataPath(path), [path]);
  const isGlobalSubProgram = useMemo(() => isGlobalSubProgramDataPath(path), [path]);
  const stepListSubPrograms = useMemo(
    () => mergeSubProgramsForStepEditor(embeddedSubPrograms, globalCatalogSubPrograms),
    [embeddedSubPrograms, globalCatalogSubPrograms],
  );
  const parentActionId = useMemo(() => actionIdFromDataPath(path), [path]);

  useEffect(() => {
    if (isEmbeddedSubProgram || isGlobalSubProgram) {
      setGlobalCatalogSubPrograms([]);
      return;
    }
    const ac = new AbortController();
    void (async () => {
      try {
        const catalog = await fetchGlobalSubProgramCatalog(ac.signal);
        if (!ac.signal.aborted) {
          setGlobalCatalogSubPrograms(catalog);
        }
      } catch {
        if (!ac.signal.aborted) {
          setGlobalCatalogSubPrograms([]);
        }
      }
    })();
    return () => ac.abort();
  }, [isEmbeddedSubProgram, isGlobalSubProgram, path]);
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
    if (tab !== "source" || !projectDirectory?.trim() || !cwd.trim()) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await fetchWorkspaceFileList(cwd, projectDirectory, {
        recursive: true,
      });
      if (cancelled) return;
      if (!result.ok) {
        setSourceFileTabs(buildActionProjectSourceFileTabs(projectDirectory, path, []));
        return;
      }
      setSourceFileTabs(
        buildActionProjectSourceFileTabs(projectDirectory, path, result.entries),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [cwd, path, projectDirectory, tab, infoRefreshKey]);

  useEffect(() => {
    const normalizedPath = normalizeWorkspacePath(sourceFileTab);
    const normalizedDataPath = normalizeWorkspacePath(path);
    if (normalizedPath === normalizedDataPath) return;
    if (!cwd.trim()) return;
    if (sourceFetchedRef.current.has(normalizedPath)) return;

    sourceFetchedRef.current.add(normalizedPath);
    let cancelled = false;
    setSourceFilePreviews((prev) => ({
      ...prev,
      [normalizedPath]: {
        content: "",
        truncated: false,
        loading: true,
      },
    }));

    void (async () => {
      const result = await fetchWorkspaceFile(cwd, normalizedPath);
      if (cancelled) return;
      if (!result.ok) {
        setSourceFilePreviews((prev) => ({
          ...prev,
          [normalizedPath]: {
            content: "",
            truncated: false,
            loading: false,
            error: result.error,
          },
        }));
        return;
      }
      setSourceFilePreviews((prev) => ({
        ...prev,
        [normalizedPath]: {
          content: result.content,
          truncated: result.truncated,
          totalChars: result.totalChars,
          loading: false,
        },
      }));
    })();

    return () => {
      cancelled = true;
    };
  }, [cwd, path, sourceFileTab]);

  const activeSourcePreview = useMemo(() => {
    const normalizedPath = normalizeWorkspacePath(sourceFileTab);
    const normalizedDataPath = normalizeWorkspacePath(path);
    if (normalizedPath === normalizedDataPath) {
      return {
        path: normalizedDataPath,
        content: editorContent,
        truncated: contentTruncated,
        totalChars,
        loading: false,
        error: undefined as string | undefined,
      };
    }
    const preview = sourceFilePreviews[normalizedPath];
    return {
      path: normalizedPath,
      content: preview?.content ?? "",
      truncated: preview?.truncated ?? false,
      totalChars: preview?.totalChars,
      loading: preview?.loading ?? true,
      error: preview?.error,
    };
  }, [
    sourceFileTab,
    path,
    editorContent,
    contentTruncated,
    totalChars,
    sourceFilePreviews,
  ]);

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
    setHasSavedLocalChanges(false);
    setSourceFilePreviews({});
    sourceFetchedRef.current = new Set();
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

  const programPinMeta = useMemo(() => {
    const normalizedPath = path.replace(/\\/g, "/");
    let programTarget: ProgramStepTarget = "action";
    if (isGlobalSubProgram) {
      programTarget = "global_subprogram";
    } else if (isEmbeddedSubProgram) {
      programTarget = "embedded_subprogram";
    }

    let programId = "";
    let subProgramId: string | undefined;
    if (programTarget === "action") {
      programId = actionId.trim() || resolveActionIdFromProject(projectFolder) || "";
    } else if (programTarget === "global_subprogram") {
      programId =
        projectInfo?.id?.trim()
        || projectInfo?.name?.trim()
        || projectFolder.trim();
    } else {
      const embeddedMatch = normalizedPath.match(/\/subprograms\/([^/]+)\/data\.json$/i);
      subProgramId = embeddedMatch?.[1];
      programId = parentActionId?.trim() || projectFolder.trim();
    }

    return {
      programTarget,
      programId,
      subProgramId,
      dataJsonPath: normalizedPath,
    };
  }, [
    actionId,
    isEmbeddedSubProgram,
    isGlobalSubProgram,
    parentActionId,
    path,
    projectFolder,
    projectInfo?.id,
    projectInfo?.name,
  ]);

  const handlePinStepToChat = useCallback(
    (stepId: string) => {
      const steps = presentRef.current.steps;
      const nodePath = resolveNodePath(steps, stepId);
      if (!nodePath) return;
      const step = findStepById(steps, stepId);
      if (!step) return;

      const wireText = serializeProgramWireJson(
        presentRef.current,
        extraTopLevelRef.current,
      );
      const sliceResult = computeProgramStepDiskSlice(wireText, nodePath);
      if (!sliceResult.ok) return;

      const tag = createProgramStepTag({
        programTarget: programPinMeta.programTarget,
        programId: programPinMeta.programId,
        subProgramId: programPinMeta.subProgramId,
        dataJsonPath: programPinMeta.dataJsonPath,
        nodePath,
        stepRunnerKey: step.stepRunnerKey ?? "",
        note: step.note,
        designerStepId: step.stepId,
        content: sliceResult.slice.content,
        contentHash: sliceResult.slice.contentHash,
        startLine: sliceResult.slice.startLine,
        endLine: sliceResult.slice.endLine,
      });
      chatComposerActionsRef.current.insertProgramStepTag(tag);
      chatComposerActionsRef.current.focusComposer();
    },
    [programPinMeta],
  );

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
    setHasSavedLocalChanges(true);
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
                layout="inline"
                className="action-project-data-editor-toolbar"
              />
              <ActionProjectSyncBar
                cwd={cwd}
                actionId={actionId}
                projectDirectory={projectDirectory}
                hasLocalChanges={dirty || hasSavedLocalChanges}
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
                hasLocalChanges={dirty || hasSavedLocalChanges}
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
              subPrograms={stepListSubPrograms}
              embeddedSubProgramsWireJson={embeddedSubProgramsWireJson}
              onPinStepToChat={handlePinStepToChat}
            />
          </ThemeProvider>
        </div>
      ) : tab === "source" ? (
        <div className="action-project-data-editor-source-panel">
          <ActionProjectSourceFileTabs
            tabs={sourceFileTabs}
            activePath={sourceFileTab}
            onSelect={setSourceFileTab}
          />
          {activeSourcePreview.loading ? (
            <p className="workspace-explorer-hint">
              加载 {basenamePath(activeSourcePreview.path)}…
            </p>
          ) : activeSourcePreview.error ? (
            <p className="workspace-explorer-hint workspace-explorer-hint--err">
              {activeSourcePreview.error}
            </p>
          ) : (
            <>
              {activeSourcePreview.truncated ? (
                <p className="workspace-explorer-hint workspace-explorer-hint--warn">
                  {basenamePath(activeSourcePreview.path)} 过大，仅显示前{" "}
                  {MAX_READ_CHARS.toLocaleString()} 个字符
                  {activeSourcePreview.totalChars !== undefined
                    ? `（文件约 ${activeSourcePreview.totalChars.toLocaleString()} 字符）`
                    : ""}
                  。
                </p>
              ) : null}
              <FileEditorCard
                path={activeSourcePreview.path}
                content={activeSourcePreview.content}
                showHeader={false}
                fillAvailable
              />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
