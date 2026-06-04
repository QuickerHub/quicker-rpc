"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ActionIcon } from "@/components/chat/ActionIcon";
import { FaIconProvider } from "@/components/chat/FaIconProvider";
import { resolveActionProjectIconSpec } from "@/lib/action-project-icon";
import { FileEditorCard } from "@/components/chat/FileEditorCard";
import { ActionProjectSyncBar } from "@/components/workspace/ActionProjectSyncBar";
import { ActionProjectToolbar } from "@/components/workspace/ActionProjectToolbar";
import { ProgramProjectDeleteControl } from "@/components/workspace/ProgramProjectDeleteControl";
import { EditableInline } from "@/components/workspace/EditableInline";
import { invokeActionCommand } from "@/lib/action-command-client";
import { resolveActionIdFromProject } from "@/lib/action-project-id";
import { actionProjectDirFromName } from "@/lib/action-project-path-shared";
import {
  parseActionProjectInfo,
  patchActionProjectInfoText,
  projectDirNameFromInfoPath,
  type InfoJsonTextField,
  type ParsedActionProjectInfo,
} from "@/lib/action-project-info-parse";
import {
  isEmbeddedSubProgramDataPath,
  isGlobalSubProgramDataPath,
} from "@/lib/action-project-data-parse";
import type { ProgramProjectDeleteKind } from "@/lib/use-program-project-delete";

type ActionProjectInfoEditorProps = {
  path: string;
  content: string;
  cwd: string;
  onSave: (nextContent: string) => Promise<{ ok: boolean; error?: string }>;
  onSaved?: () => void;
  onSynced?: () => void;
};

function CopyableText({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current != null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (copiedTimerRef.current != null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copiedTimerRef.current = null;
      }, 480);
    } catch {
      /* ignore */
    }
  }, [value]);

  return (
    <span
      role="button"
      tabIndex={0}
      className={`project-info-copyable${copied ? " project-info-copyable--copied" : ""}${className ? ` ${className}` : ""}`}
      onClick={() => void onCopy()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void onCopy();
        }
      }}
      title={copied ? "已复制" : `点击复制${label}`}
    >
      {value}
    </span>
  );
}

function ProjectInfoMetaPopup({
  data,
}: {
  data: ParsedActionProjectInfo;
}) {
  const popupId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    setOpen(false);
  }, [data.icon]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        close();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  const displayIconSpec = resolveActionProjectIconSpec(data.icon);
  const hasStoredIcon = Boolean(data.icon?.trim());

  const iconButton = (
    <ActionIcon spec={displayIconSpec} className="project-info-icon" />
  );

  if (!hasStoredIcon) {
    return (
      <FaIconProvider specs={[displayIconSpec]}>
        <div className="project-info-icon-wrap project-info-icon-wrap--static">
          {iconButton}
        </div>
      </FaIconProvider>
    );
  }

  return (
    <FaIconProvider specs={[displayIconSpec]}>
      <div className="project-info-icon-anchor" ref={wrapRef}>
        <button
          type="button"
          className="project-info-icon-wrap"
          aria-label="图标"
          aria-expanded={open}
          aria-controls={popupId}
          title="点击查看 Icon"
          onClick={() => setOpen((v) => !v)}
        >
          {iconButton}
        </button>

        {open ? (
          <div
            id={popupId}
            className="composer-popup project-info-meta-popup"
            role="dialog"
            aria-label="图标"
          >
            <p className="project-info-meta-popup-title">图标</p>
            <dl className="project-info-meta-popup-fields">
              <InfoField label="Icon" mono>
                <CopyableText value={data.icon!} label="Icon" />
              </InfoField>
            </dl>
          </div>
        ) : null}
      </div>
    </FaIconProvider>
  );
}

function InfoField({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="project-info-field">
      <dt className="project-info-label">{label}</dt>
      <dd className={`project-info-value${mono ? " project-info-value--mono" : ""}`}>{children}</dd>
    </div>
  );
}

function InfoBody({
  data,
  path,
  content,
  cwd,
  onSave,
  onSaved,
  onSynced,
}: {
  data: ParsedActionProjectInfo;
  path: string;
  content: string;
  cwd: string;
  onSave: (nextContent: string) => Promise<{ ok: boolean; error?: string }>;
  onSaved?: () => void;
  onSynced?: () => void;
}) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setSaveError(null);
  }, [path]);
  const projectDir = projectDirNameFromInfoPath(path);
  const projectDirectory = projectDir
    ? actionProjectDirFromName(projectDir)
    : undefined;
  const linkedActionId = useMemo(
    () => resolveActionIdFromProject(projectDir, data),
    [projectDir, data.id],
  );

  const showProjectDir =
    !!projectDir
    && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectDir);
  const extraEntries =
    data.kind === "subprogram" ? Object.entries(data.extra) : [];

  const displayField: InfoJsonTextField = data.kind === "action" ? "title" : "name";
  const displayValue =
    data.kind === "action" ? (data.title ?? "") : (data.name ?? data.title ?? "");
  const descriptionValue = data.description ?? "";

  const [draftTitle, setDraftTitle] = useState(displayValue);
  const [draftDescription, setDraftDescription] = useState(descriptionValue);

  useEffect(() => {
    setDraftTitle(displayValue);
    setDraftDescription(descriptionValue);
    setSaveError(null);
  }, [path, displayValue, descriptionValue]);

  const isDirty =
    draftTitle !== displayValue || draftDescription !== descriptionValue;

  const deleteTarget = useMemo((): {
    kind: ProgramProjectDeleteKind;
    projectPath: string;
    quickerId?: string;
    displayTitle: string;
  } | null => {
    const normalizedPath = path.replace(/\\/g, "/");
    const projectPath = normalizedPath.replace(/\/info\.json$/i, "");
    if (!projectPath) return null;

    const title =
      displayValue.trim()
      || projectDir?.trim()
      || "（无标题）";

    if (isGlobalSubProgramDataPath(`${projectPath}/data.json`)) {
      const quickerId =
        data.id?.trim()
        || data.name?.trim()
        || projectDir?.trim()
        || undefined;
      return { kind: "global_subprogram", projectPath, quickerId, displayTitle: title };
    }

    if (isEmbeddedSubProgramDataPath(`${projectPath}/data.json`)) {
      return { kind: "embedded_subprogram", projectPath, displayTitle: title };
    }

    if (data.kind === "action") {
      const quickerId = linkedActionId?.trim() || undefined;
      return { kind: "action", projectPath, quickerId, displayTitle: title };
    }

    return null;
  }, [
    data.id,
    data.kind,
    data.name,
    displayValue,
    linkedActionId,
    path,
    projectDir,
  ]);

  const buildPatchedContent = useCallback(() => {
    let nextContent = content;
    if (draftTitle !== displayValue) {
      const patched = patchActionProjectInfoText(nextContent, displayField, draftTitle);
      if (!patched.ok) return patched;
      nextContent = patched.content;
    }
    if (draftDescription !== descriptionValue) {
      const patched = patchActionProjectInfoText(nextContent, "description", draftDescription);
      if (!patched.ok) return patched;
      nextContent = patched.content;
    }
    return { ok: true as const, content: nextContent };
  }, [
    content,
    descriptionValue,
    displayField,
    displayValue,
    draftDescription,
    draftTitle,
  ]);

  const handleSave = useCallback(async () => {
    if (!isDirty || saving) return;
    setSaving(true);
    setSaveError(null);

    const patched = buildPatchedContent();
    if (!patched.ok) {
      setSaveError(patched.error);
      setSaving(false);
      return;
    }

    const fileResult = await onSave(patched.content);
    if (!fileResult.ok) {
      setSaveError(fileResult.error ?? "保存失败");
      setSaving(false);
      return;
    }

    if (data.kind === "action" && linkedActionId) {
      const metaResult = await invokeActionCommand({
        op: "set-metadata",
        id: linkedActionId,
        title: draftTitle,
        description: draftDescription,
        expectedEditVersion: data.editVersion,
      });
      if (!metaResult.ok) {
        setSaveError(`已写入 info.json，同步 Quicker 失败：${metaResult.error}`);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    onSaved?.();
  }, [
    buildPatchedContent,
    data.editVersion,
    linkedActionId,
    data.kind,
    draftDescription,
    draftTitle,
    isDirty,
    onSave,
    onSaved,
    saving,
  ]);

  const noopCommit = useCallback(async () => {}, []);

  return (
    <article className="project-info-editor">
        <div
          className={`project-info-main-card${isDirty ? " project-info-main-card--dirty" : ""}`}
        >
          <header className="project-info-header">
            <ProjectInfoMetaPopup data={data} />
            <div className="project-info-heading">
              <EditableInline
                className="project-info-title project-info-title--editable"
                value={displayValue}
                placeholder="（无标题）"
                commitOnBlur={false}
                onDraftChange={setDraftTitle}
                onCommit={noopCommit}
              />
              {showProjectDir ? (
                <p className="project-info-folder" title={path}>
                  {projectDir}
                </p>
              ) : null}
            </div>
            {deleteTarget ? (
              <ProgramProjectDeleteControl
                kind={deleteTarget.kind}
                quickerId={deleteTarget.quickerId}
                projectPath={deleteTarget.projectPath}
                cwd={cwd}
                displayTitle={deleteTarget.displayTitle}
                className="project-info-header-delete"
              />
            ) : null}
          </header>

          <section className="project-info-description-block" aria-label="描述">
            <span className="project-info-section-label">描述</span>
            <EditableInline
              className="project-info-description project-info-description--editable"
              value={descriptionValue}
              placeholder="添加描述…"
              multiline
              commitOnBlur={false}
              onDraftChange={setDraftDescription}
              onCommit={noopCommit}
            />
          </section>

          {isDirty ? (
            <div className="project-info-save-footer">
              <span className="project-info-save-hint">有未保存的修改</span>
              <button
                type="button"
                className="project-info-save-btn"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          ) : null}
        </div>

        {saveError ? <p className="project-info-save-error">{saveError}</p> : null}

        {data.callIdentifier ? (
          <dl className="project-info-fields">
            <InfoField label="调用" mono>
              <CopyableText value={data.callIdentifier} label="调用标识" />
            </InfoField>
          </dl>
        ) : null}

        {extraEntries.length > 0 ? (
          <section className="project-info-extra" aria-label="其它字段">
            <h3 className="project-info-extra-title">其它字段</h3>
            <dl className="project-info-fields project-info-fields--compact">
              {extraEntries.map(([key, value]) => (
                <InfoField key={key} label={key} mono>
                  {typeof value === "string" || typeof value === "number"
                    ? String(value)
                    : JSON.stringify(value)}
                </InfoField>
              ))}
            </dl>
          </section>
        ) : null}

        {data.kind === "action" && linkedActionId ? (
          <>
            <ActionProjectSyncBar
              key={linkedActionId}
              cwd={cwd}
              actionId={linkedActionId}
              projectDirectory={projectDirectory}
              blocked={isDirty}
              blockReason="请先保存标题/描述，再拉取或提交步骤"
              onSynced={onSynced}
            />
            <ActionProjectToolbar actionId={linkedActionId} />
          </>
        ) : data.kind === "action" ? (
          <p className="project-info-sync-status project-info-sync-status--err">
            无法解析动作 Id：请将项目文件夹改为动作 GUID，或从 Agent 拉取到 GUID 目录。
          </p>
        ) : null}
    </article>
  );
}

export function ActionProjectInfoEditor({
  path,
  content,
  cwd,
  onSave,
  onSaved,
  onSynced,
}: ActionProjectInfoEditorProps) {
  const parsed = useMemo(() => parseActionProjectInfo(content), [content]);

  if (!parsed.ok) {
    return (
      <div className="project-info-editor project-info-editor--error">
        <p className="project-info-parse-error">{parsed.error}</p>
        <FileEditorCard path={path} content={content} />
      </div>
    );
  }

  return (
    <div className="project-info-editor-wrap">
      <InfoBody
        key={path}
        data={parsed.data}
        path={path}
        content={content}
        cwd={cwd}
        onSave={onSave}
        onSaved={onSaved}
        onSynced={onSynced}
      />
    </div>
  );
}
