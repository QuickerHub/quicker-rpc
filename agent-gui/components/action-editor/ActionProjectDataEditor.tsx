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
import { actionProjectDirFromName } from "@/lib/action-project-path-shared";
import { actionProjectInfoPathFromDataPath } from "@/lib/action-project-data-parse";
import { resolveActionIdFromProject } from "@/lib/action-project-id";
import {
  parseActionProjectInfo,
  type ParsedActionProjectInfo,
} from "@/lib/action-project-info-parse";
import { basenamePath } from "@/lib/workspace-file-tool";
import { fetchWorkspaceFile } from "@/lib/workspace-explorer-api";
import type { XProgramPresent } from "@/lib/action-editor/program/xProgramHistory";
import {
  fingerprintProgramWire,
  parseProgramWireJson,
  serializeProgramWireJson,
} from "@/lib/action-editor/wire/programWire";
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
  cwd,
  onSave,
  onSaved,
  onSynced,
}: ActionProjectDataEditorProps): JSX.Element {
  const [tab, setTab] = useState<EditorTab>("visual");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [projectInfo, setProjectInfo] = useState<ParsedActionProjectInfo | null>(null);
  const [infoRefreshKey, setInfoRefreshKey] = useState(0);
  const extraTopLevelRef = useRef<Record<string, unknown>>({});
  const baselineRef = useRef("");
  const presentRef = useRef<XProgramPresent>({ steps: [], variables: [] });

  const parsed = useMemo(() => parseProgramWireJson(content), [content]);
  const projectFolder = useMemo(() => {
    const normalized = path.replace(/\\/g, "/");
    const parent = normalized.replace(/\/data\.json$/i, "");
    return basenamePath(parent);
  }, [path]);
  const actionId = useMemo(
    () => resolveActionIdFromProject(projectFolder) ?? "",
    [projectFolder],
  );
  const projectDirectory = useMemo(
    () => (projectFolder ? actionProjectDirFromName(projectFolder) : undefined),
    [projectFolder],
  );
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

  useEffect(() => {
    if (!parsed.ok) return;
    extraTopLevelRef.current = parsed.extraTopLevel;
    baselineRef.current = fingerprintProgramWire(parsed.present);
    presentRef.current = parsed.present;
    setDirty(false);
  }, [content, parsed]);

  const handlePresentChange = useCallback((present: XProgramPresent, meta: { dirty: boolean }) => {
    presentRef.current = present;
    setDirty(meta.dirty);
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

      {tab === "visual" ? (
        <div className="action-project-data-editor-visual x-program-host">
          <ThemeProvider>
            <XProgramEditor
              initialPresent={parsed.present}
              baselineFingerprint={baselineRef.current || fingerprintProgramWire(parsed.present)}
              onPresentChange={handlePresentChange}
            />
          </ThemeProvider>
        </div>
      ) : (
        <FileEditorCard path={path} content={content} showHeader={false} />
      )}
    </div>
  );
}
