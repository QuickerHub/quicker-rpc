"use client";

import { DesignerCatalogProvider, useDocumentDesignerCatalogPort } from "@/lib/action-editor/catalog/DesignerCatalogProvider";
import type { DesignerCatalogPort } from "@/lib/action-editor/catalog/designerCatalogPort";
import type { DesignerCatalogScope } from "@/lib/action-editor/catalog/designerCatalogContext";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
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
  type ProgramStepTag,
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
import { createProgramDocumentEditorController } from "@/lib/action-editor/program/programDocumentEditorController";
import { createProgramDocumentSession, type ProgramDocumentSession } from "@/lib/action-editor/document/programDocumentSession";
import { fingerprintProgramDocumentContent, serializeProgramDocumentSnapshot } from "@/lib/action-editor/document/programDocumentWire";
import { ProgramEditorTabWorkspace, type ProgramEditorWorkspaceHandle } from "./ProgramEditorTabWorkspace";
import { ProgramAppearanceEditor } from "./ProgramAppearanceEditor";
import type { ProgramDocumentMetadataPatch } from "@/lib/action-editor/document/programDocumentMetadata";
import type { ProgramDocumentSaveRequest, ProgramDocumentSaveResult } from "@/lib/program-document-save";
import { readProgramDocumentTargetClient, saveProgramDocumentClient } from "@/lib/program-document-save-client";
import { actionProjectSyncTargetKey, type ActionProjectSyncTarget } from "@/lib/action-project-sync-target";
import { ActionProjectTargetSummary } from "./ActionProjectTargetSummary";
import {
  fetchGlobalSubProgramCatalog,
} from "@/lib/action-editor/subprograms/globalSubProgramCatalog";
import {
  parseProgramWireJson,
  serializeWireSubProgramsJson,
} from "@/lib/action-editor/wire/programWire";
import type { ProgramProjectDeleteKind } from "@/lib/use-program-project-delete";
import { ThemeProvider } from "@/lib/action-editor/shared/ThemeContext";
import { AD_ICONIFY_SPEC } from "@/lib/action-editor/shared/actionDesignerIconify";
import { getActionDesignerBackendBaseUrl } from "@/lib/action-editor/shared/actionDesignerBackendBaseUrl";
import { IconControl } from "@/lib/action-editor/shared/IconControl";
import { ActionDesignerHelpDialog } from "@/components/action-editor/ActionDesignerHelpDialog";
import "@/components/action-editor/action-editor-theme.css";
import "@/components/action-editor/action-editor.css";
import "@/components/action-editor/action-project-data-editor.css";

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

function sameProgramDocument(left: string, right: string): boolean {
  if (left === right) return true;
  try { return fingerprintProgramDocumentContent(left) === fingerprintProgramDocumentContent(right); }
  catch { return false; }
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
  /** Presentation only; hiding the editor retains its session and pending saves. */
  active?: boolean;
  onPinStepToChat?: (tag: ProgramStepTag) => void;
  path: string;
  content: string;
  /** When true, content may be an agent slice — editor refetches full file from workspace API. */
  truncated?: boolean;
  totalChars?: number;
  cwd: string;
  onSave: (nextContent: string) => Promise<{ ok: boolean; error?: string }>;
  onSaveDocument?: (request: ProgramDocumentSaveRequest) => Promise<ProgramDocumentSaveResult>;
  onSaved?: () => void;
  onSynced?: () => void | Promise<void>;
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
  active = true,
  onPinStepToChat,
  path,
  content,
  truncated = false,
  totalChars,
  cwd,
  onSave,
  onSaveDocument,
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
  const [externalConflict, setExternalConflict] = useState<string | null>(null);
  const [metadataConflict, setMetadataConflict] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [targetFailure, setTargetFailure] = useState<{ session: ProgramDocumentSession; error: string } | null>(null);
  const [pinStepFeedback, setPinStepFeedback] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [hasSavedLocalChanges, setHasSavedLocalChanges] = useState(false);
  const documentOwnerKey = `${cwd}::${path}`;
  const documentOwnerKeyRef = useRef(documentOwnerKey);
  documentOwnerKeyRef.current = documentOwnerKey;
  const [syncBusyOwner, setSyncBusyOwner] = useState<{ key: string; busy: boolean } | null>(null);
  const [projectInfo, setProjectInfo] = useState<ParsedActionProjectInfo | null>(null);
  const [infoRefreshKey, setInfoRefreshKey] = useState(0);
  const sessionRef = useRef<ProgramDocumentSession | null>(null);
  const workspaceRef = useRef<ProgramEditorWorkspaceHandle | null>(null);
  const incomingDocumentRef = useRef({ path, cwd });
  const [documentRevision, setDocumentRevision] = useState(0);
  const sessionMountRef = useRef<{ session: ProgramDocumentSession; mounted: boolean } | null>(null);
  const metadataSourceOwnerRef = useRef<ProgramDocumentSession | null>(null);
  const projectInfoReadRef = useRef(0);
  const sourceFetchedRef = useRef<Set<string>>(new Set());
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const designerBackendBaseUrl = useMemo(() => getActionDesignerBackendBaseUrl(), []);

  useEffect(() => {
    if (!active || !helpOpen) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "F1") {
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [active, helpOpen]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "F1" || event.repeat || helpOpen) return;
      const root = editorRootRef.current;
      if (!root) return;
      const target = event.target;
      if (!(target instanceof Node) || !root.contains(target)) return;
      event.preventDefault();
      setHelpOpen(true);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [active, helpOpen]);

  useEffect(() => {
    const sameDocument = incomingDocumentRef.current.path === path && incomingDocumentRef.current.cwd === cwd;
    incomingDocumentRef.current = { path, cwd };
    const current = sessionRef.current?.getState();
    // A save acknowledgement must not replace a newer local draft or reset editor history.
    if (sameDocument && current && !truncated) {
      if (sessionRef.current?.isSaveAcknowledgement(content) || sameProgramDocument(content, current.content)) {
        setExternalConflict(null);
        return;
      }
      if (current.dirty || current.saving) {
        setExternalConflict("工作区文件已在外部变更，当前草稿已保留。请在源码视图保留草稿并重新打开文件，比较合并后再保存。");
        return;
      }
    }
    setExternalConflict(null);
    setEditorContent(content);
    setContentTruncated(truncated);
    setSourceFileTab(normalizeWorkspacePath(path));
    setSourceFilePreviews({});
    sourceFetchedRef.current = new Set();
  }, [content, truncated, path, cwd]);

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

  const sessionResult = useMemo(() => {
    if (!parsed.ok || contentTruncated) return null;
    try {
      const session = createProgramDocumentSession({ content: editorContent, identity: {
        documentKey: `${normalizeWorkspacePath(cwd)}::${normalizeWorkspacePath(path)}`,
      } });
      return { session };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [editorContent, parsed.ok, contentTruncated, cwd, path]);
  const session = sessionResult && "session" in sessionResult ? sessionResult.session : null;
  sessionRef.current = session ?? null;
  useEffect(() => {
    setDirty(session?.getState().dirty ?? false);
    setSaving(session?.getState().saving ?? false);
    setDocumentRevision((revision) => revision + 1);
    if (!session) return;
    const owner = { session, mounted: true };
    sessionMountRef.current = owner;
    return () => {
      owner.mounted = false;
      // StrictMode immediately remounts effects with the same session. Only a departed owner closes it.
      queueMicrotask(() => {
        const replacement = sessionMountRef.current;
        if (replacement?.mounted && replacement.session === session) return;
        session.close();
      });
    };
  }, [session]);
  const embeddedSubProgramsWireJson = useMemo(() => {
    if (!session) return undefined;
    const current = parseProgramWireJson(session.getState().content);
    return current.ok ? serializeWireSubProgramsJson(current.extraTopLevel.subPrograms) : undefined;
  }, [session, documentRevision]);
  const [globalCatalogState, setGlobalCatalogState] = useState<{ port?: DesignerCatalogPort; items: ActionSubProgram[] }>({ items: [] });
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
    return session?.getState().identity.projectBinding?.actionId ?? resolveActionIdFromProject(projectFolder, projectInfo ?? undefined) ?? "";
  }, [isEmbeddedSubProgram, isGlobalSubProgram, projectFolder, projectInfo, session, documentRevision]);
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
  const metadataEnabled = Boolean(onSaveDocument) && !isEmbeddedSubProgram && !isGlobalSubProgram;
  const mainAction = !isEmbeddedSubProgram && !isGlobalSubProgram;
  const projectBinding = session?.getState().identity.projectBinding;
  const targetError = targetFailure && targetFailure.session === session ? targetFailure.error : undefined;
  const targetBlocked = mainAction && (projectBinding === undefined || Boolean(targetError));
  const syncTarget: ActionProjectSyncTarget | undefined = mainAction && projectDirectory && projectBinding
    ? { projectDirectory, projectBinding } : undefined;
  const catalogScope: DesignerCatalogScope = !mainAction ? undefined
    : targetBlocked || !projectDirectory ? null
    : { cwd, projectDirectory, expectedProjectBinding: projectBinding ?? null };
  const catalogPort = useDocumentDesignerCatalogPort(catalogScope, session ?? null);
  useEffect(() => {
    if (isEmbeddedSubProgram || isGlobalSubProgram) {
      setGlobalCatalogState({ port: catalogPort, items: [] });
      return;
    }
    const ac = new AbortController();
    void (async () => {
      try {
        const catalog = await fetchGlobalSubProgramCatalog(ac.signal, catalogPort);
        if (!ac.signal.aborted) {
          setGlobalCatalogState({ port: catalogPort, items: catalog });
        }
      } catch {
        if (!ac.signal.aborted) {
          setGlobalCatalogState({ port: catalogPort, items: [] });
        }
      }
    })();
    return () => ac.abort();
  }, [isEmbeddedSubProgram, isGlobalSubProgram, path, catalogPort]);
  const targetKey = actionProjectSyncTargetKey(syncTarget);
  const syncOwnerKey = `${documentOwnerKey}::${targetKey}`;
  const syncOwnerRef = useRef({ key: syncOwnerKey, session });
  syncOwnerRef.current = { key: syncOwnerKey, session };
  const hostSyncBusy = syncBusyOwner?.key === syncOwnerKey && syncBusyOwner.busy;
  const handleSyncBusyChange = useCallback((busy: boolean) => {
    if (syncOwnerRef.current.key === syncOwnerKey && syncOwnerRef.current.session === session) setSyncBusyOwner({ key: syncOwnerKey, busy });
  }, [syncOwnerKey, session]);

  useEffect(() => {
    if (!mainAction || !session) return;
    const cancel = new AbortController();
    const isCurrent = () => !cancel.signal.aborted && sessionRef.current === session && documentOwnerKeyRef.current === documentOwnerKey;
    void (async () => {
      const result = await readProgramDocumentTargetClient(cwd, path, cancel.signal);
      if (!isCurrent()) return;
      if (!result.ok) { setTargetFailure({ session, error: result.error }); return; }
      const reconciled = session.reconcileProjectBinding(result.projectBinding);
      if (!reconciled.ok) { setTargetFailure({ session, error: reconciled.error }); return; }
      setTargetFailure(null);
      setDocumentRevision((revision) => revision + 1);
    })();
    return () => cancel.abort();
  }, [mainAction, session, documentOwnerKey, cwd, path]);

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
        content: session?.getState().content ?? editorContent,
        truncated: contentTruncated,
        totalChars,
        loading: false,
        error: undefined as string | undefined,
      };
    }
    const metadata = session?.getState().metadata;
    if (metadata && normalizedPath === normalizeWorkspacePath(metadata.path)) {
      return { path: normalizedPath, content: metadata.content, truncated: false, totalChars: undefined, loading: false, error: undefined as string | undefined };
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
    session,
    documentRevision,
  ]);

  const refreshProjectInfo = useCallback(async (isCurrent: () => boolean): Promise<{ ok: true } | { ok: false; error: string }> => {
    const readId = ++projectInfoReadRef.current;
    const ownsRead = () => isCurrent() && projectInfoReadRef.current === readId;
    if (!infoJsonPath) {
      if (ownsRead()) setProjectInfo(null);
      return { ok: true };
    }
    try {
      const result = await fetchWorkspaceFile(cwd, infoJsonPath);
      if (!ownsRead()) return { ok: true };
      if (!result.ok) {
        setProjectInfo(null);
        if (metadataEnabled) setMetadataError(result.error);
        return { ok: false, error: result.error };
      }
      const parsed = parseActionProjectInfo(result.content);
      setProjectInfo(parsed.ok ? parsed.data : null);
      if (metadataEnabled && session && sessionRef.current === session) {
        if (result.truncated) {
          setMetadataError("属性文件未完整加载");
          return { ok: false, error: "属性文件未完整加载" };
        }
        const reconciled = session.reconcileMetadataSource({ path: infoJsonPath, content: result.content });
        if (!reconciled.ok) {
          if (reconciled.code === "metadata_conflict" || reconciled.code === "identity_conflict") {
            setMetadataConflict("动作属性已在外部变更，当前草稿已保留。请比较合并后再保存。");
          } else setMetadataError(reconciled.error);
          return { ok: false, error: reconciled.error };
        }
        setDirty(reconciled.state.dirty);
        // A replacement session may reach the same numeric revision as the old one.
        // Always notify React after attaching its metadata, including batched path changes.
        setDocumentRevision((revision) => revision + 1);
        setMetadataConflict(null);
        setMetadataError(null);
      }
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (ownsRead() && metadataEnabled) setMetadataError(message);
      return { ok: false, error: message };
    }
  }, [cwd, infoJsonPath, session, metadataEnabled]);

  useEffect(() => {
    let cancelled = false;
    if (metadataSourceOwnerRef.current !== session) {
      metadataSourceOwnerRef.current = session ?? null;
      setMetadataError(null);
      setMetadataConflict(null);
    }
    void refreshProjectInfo(() => !cancelled && documentOwnerKeyRef.current === documentOwnerKey && sessionRef.current === session);
    return () => {
      cancelled = true;
    };
  }, [refreshProjectInfo, session, documentOwnerKey]);

  const handleSynced = useCallback(async () => {
    const isCurrent = () => documentOwnerKeyRef.current === documentOwnerKey && sessionRef.current === session;
    if (!isCurrent()) return;
    const refreshed = await refreshProjectInfo(isCurrent);
    if (!isCurrent()) return;
    if (!refreshed.ok) {
      const message = `宿主已同步，但工作区刷新失败：${refreshed.error}。请重新打开项目核对后再保存。`;
      setMetadataConflict(message);
      setMetadataError(null);
      throw new Error(message);
    }
    setHasSavedLocalChanges(false);
    setSourceFilePreviews({});
    sourceFetchedRef.current = new Set();
    setInfoRefreshKey((n) => n + 1);
    await onSynced?.();
  }, [documentOwnerKey, session, refreshProjectInfo, onSynced]);

  const liveMetadata = session?.readMetadata();
  const metaTitle = liveMetadata?.title ?? displayTitleFromProjectInfo(projectInfo, projectFolder);
  const metaDescription = liveMetadata?.description ?? projectInfo?.description?.trim() ?? "";
  const metaIcon = liveMetadata?.icon ?? projectInfo?.icon;

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

    // Host deletion is disabled until the command adapter accepts this document's complete target.
    return { kind: "action", projectPath, displayTitle: title };
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

  const documentController = useMemo(() => session ? createProgramDocumentEditorController(session, {
    isCurrent: () => sessionRef.current === session,
    onChange: (result) => {
      if (sessionRef.current !== session) return;
      if (!result.ok) setSaveError(result.error);
      setDirty(result.state.dirty);
      setDocumentRevision((revision) => revision + 1);
    },
  }) : null, [session]);
  const handleWorkspaceChange = useCallback((handle: ProgramEditorWorkspaceHandle | null) => {
    workspaceRef.current = handle;
  }, []);
  const handleMetadataChange = useCallback((patch: ProgramDocumentMetadataPatch) => {
    if (!session || sessionRef.current !== session) return;
    const result = session.applyMetadata(patch, { expectedRevision: session.getState().revision, source: "ui" });
    if (!result.ok) setSaveError(result.error);
    setDirty(result.state.dirty);
    setDocumentRevision((revision) => revision + 1);
  }, [session]);

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
      if (!active || !session) return;
      workspaceRef.current?.flushPendingEdits();
      const snapshot = session.readSnapshot();
      const steps = snapshot.steps;
      const nodePath = resolveNodePath(steps, stepId);
      if (!nodePath) {
        setPinStepFeedback("无法定位步骤在 data.json 中的路径");
        return;
      }
      const step = findStepById(steps, stepId);
      if (!step) {
        setPinStepFeedback("未找到选中的步骤");
        return;
      }

      const wireText = serializeProgramDocumentSnapshot(session.getState().content, snapshot);
      const sliceResult = computeProgramStepDiskSlice(wireText, nodePath);
      if (!sliceResult.ok) {
        setPinStepFeedback(sliceResult.error);
        return;
      }

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
      if (onPinStepToChat) onPinStepToChat(tag);
      else {
        chatComposerActionsRef.current.insertProgramStepTag(tag);
        chatComposerActionsRef.current.focusComposer();
      }
      setPinStepFeedback("已添加到左侧当前对话输入框");
      window.setTimeout(() => setPinStepFeedback(null), 2500);
    },
    [active, onPinStepToChat, programPinMeta, session],
  );

  const handleSave = useCallback(async () => {
    if (!active || !session || externalConflict || metadataConflict || hostSyncBusy || targetBlocked) return;
    workspaceRef.current?.flushPendingEdits();
    const started = session.beginSave(() => session.readSnapshot());
    if (!started.ok) {
      setSaveError(started.error);
      return;
    }
    setSaving(started.state.saving);
    setSaveError(null);
    let outcome: ProgramDocumentSaveResult;
    try {
      const ticket = started.ticket;
      if (onSaveDocument || mainAction) {
        const request: ProgramDocumentSaveRequest = { path, content: ticket.content, expectedContent: ticket.baselineContent,
          ...(ticket.metadata ? { metadata: { content: ticket.metadata.content, expectedContent: ticket.metadata.baselineContent } } : {}),
          ...(mainAction ? { expectedProjectBinding: ticket.identity.projectBinding } : {}),
        };
        outcome = onSaveDocument ? await onSaveDocument(request) : await saveProgramDocumentClient(cwd, request);
      } else {
        const saved = await onSave(ticket.content);
        outcome = saved.ok ? { ok: true } : { ok: false, error: saved.error ?? "保存失败" };
      }
    } catch (error) {
      outcome = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    const completed = session.completeSave(started.ticket, outcome);
    if (sessionRef.current !== session || !sessionMountRef.current?.mounted) return;
    setSaving(completed.state.saving);
    setDirty(completed.state.dirty);
    setDocumentRevision((revision) => revision + 1);
    if (!completed.ok) {
      setSaveError(completed.error);
      if (!outcome.ok && outcome.code === "identity_conflict") {
        setTargetFailure({ session, error: "动作目标已在外部变更，当前草稿已保留。请重新打开项目核对后再保存。" });
      } else if (!outcome.ok && outcome.code === "metadata_conflict") {
        setMetadataConflict("动作属性已在外部变更，当前草稿已保留。请比较合并后再保存。");
      } else if (!outcome.ok && outcome.code === "body_conflict") {
        setExternalConflict("工作区文件已在外部变更，当前草稿已保留。请比较合并后再保存。");
      }
      if (completed.persistedParts?.body || completed.persistedParts?.metadata) {
        setHasSavedLocalChanges(true);
        setInfoRefreshKey((value) => value + 1);
        onSaved?.();
      }
      return;
    }
    setHasSavedLocalChanges(true);
    setInfoRefreshKey((value) => value + 1);
    onSaved?.();
  }, [active, onSave, onSaveDocument, onSaved, session, externalConflict, metadataConflict, path, cwd, hostSyncBusy, targetBlocked, mainAction]);

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
  if (!session) {
    return <p className="workspace-explorer-hint workspace-explorer-hint--err" role="alert">
      无法建立完整动作编辑会话：{sessionResult && "error" in sessionResult ? sessionResult.error : "动作尚未加载"}
    </p>;
  }

  const editor = (
    <div className="action-project-data-editor" ref={editorRootRef} inert={!active}>
      <div className="action-project-data-editor-header">
        <ActionProjectMetaSummary
          icon={metaIcon}
          title={metaTitle}
          description={metaDescription}
        />
        {mainAction ? <ActionProjectTargetSummary binding={projectBinding} error={targetError} /> : null}
        {actionId ? (
          <div className="action-project-data-editor-actions">
            <div className="action-project-data-editor-actions-row">
              <ActionProjectToolbar
                actionId={actionId}
                layout="inline"
                className="action-project-data-editor-toolbar"
                disabledReason={targetBlocked ? "动作目标尚未确认，无法操作宿主" : projectBinding === null ? "未绑定宿主，无法运行或打开动作" : "运行、调试、编辑和悬浮尚未接入此文档目标，暂不可用"}
              />
              <ActionProjectSyncBar
                active={active}
                key={syncOwnerKey}
                cwd={cwd}
                actionId={actionId}
                projectDirectory={projectDirectory}
                target={syncTarget}
                targetRequired
                hasLocalChanges={dirty || hasSavedLocalChanges}
                blocked={!active || targetBlocked || projectBinding === null || dirty || saving || Boolean(externalConflict || metadataConflict)}
                blockReason={targetError || (projectBinding === undefined ? "正在读取动作目标" : projectBinding === null ? "未绑定宿主，无法同步到 Quicker" : undefined) || externalConflict || metadataConflict || (dirty || saving ? "请先保存当前编辑再同步到 Quicker" : undefined)}
                className="action-project-data-editor-sync"
                onSynced={handleSynced}
                onBusyChange={handleSyncBusyChange}
              />
              {deleteTarget ? (
                <ProgramProjectDeleteControl
                  active={active}
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
                active={active}
                key={documentOwnerKey}
                cwd={cwd}
                actionId={syncActionId}
                projectDirectory={syncProjectDirectory}
                hasLocalChanges={dirty || hasSavedLocalChanges}
                blocked={!active || dirty || saving || Boolean(externalConflict || metadataConflict)}
                blockReason={externalConflict || metadataConflict || (dirty || saving ? "请先点击「保存到工作区」再同步到 Quicker" : undefined)}
                className="action-project-data-editor-sync"
                onSynced={handleSynced}
                onBusyChange={handleSyncBusyChange}
              />
              {deleteTarget ? (
                <ProgramProjectDeleteControl
                  active={active}
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
                active={active}
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
            className="action-project-data-editor-help"
            aria-label="动作编辑器说明"
            title="动作编辑器说明（F1）"
            onClick={() => setHelpOpen(true)}
          >
            <IconControl
              spec={AD_ICONIFY_SPEC.help}
              size={14}
              resourceBaseUrl={designerBackendBaseUrl}
            />
          </button>
          <button
            type="button"
            className="action-project-data-editor-save"
            disabled={!active || !dirty || saving || hostSyncBusy || targetBlocked || Boolean(externalConflict || metadataConflict)}
            onClick={() => void handleSave()}
          >
            {saving ? "保存中…" : "保存到工作区"}
          </button>
        </div>
      </div>

      {helpOpen && active ? <ActionDesignerHelpDialog onClose={() => setHelpOpen(false)} /> : null}

      {saveError ? (
        <p className="workspace-explorer-hint workspace-explorer-hint--err">{saveError}</p>
      ) : null}
      {externalConflict ? <p className="workspace-explorer-hint workspace-explorer-hint--err" role="alert">
        {externalConflict}
      </p> : null}
      {metadataConflict || metadataError ? <p className="workspace-explorer-hint workspace-explorer-hint--err" role="alert">
        {metadataConflict || metadataError}
      </p> : null}
      {pinStepFeedback ? (
        <p
          className={`workspace-explorer-hint${
            pinStepFeedback.startsWith("已添加")
              ? ""
              : " workspace-explorer-hint--err"
          }`}
          role="status"
        >
          {pinStepFeedback}
        </p>
      ) : null}

      <div hidden={tab !== "visual"} inert={hostSyncBusy} aria-busy={hostSyncBusy} className="action-project-data-editor-visual x-program-host">
          <ThemeProvider>
            <ProgramEditorTabWorkspace
              key={`${session.getState().identity.documentKey}::${editorContent}`}
              documentKey={session.getState().identity.documentKey}
              controller={documentController!}
              active={active && tab === "visual"}
              historyDisabled={!active || hostSyncBusy}
              mainSurface={isEmbeddedSubProgram ? "subProgram" : "main"}
              workspaceContext={workspaceContext}
              catalogPort={catalogPort}
              globalSubPrograms={globalCatalogState.port === catalogPort ? globalCatalogState.items : []}
              embeddedSubProgramsWireJson={embeddedSubProgramsWireJson}
              onHandleChange={handleWorkspaceChange}
              onPinStepToChat={handlePinStepToChat}
              metadataPanel={metadataEnabled && liveMetadata ? <ProgramAppearanceEditor
                value={liveMetadata} disabled={!active || hostSyncBusy} onChange={handleMetadataChange} onSave={() => void handleSave()} /> : undefined}
            />
          </ThemeProvider>
        </div>
      {tab === "source" ? (
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
  return mainAction ? <DesignerCatalogProvider port={catalogPort}>{editor}</DesignerCatalogProvider> : editor;
}
