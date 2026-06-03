"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ActionIcon } from "@/components/chat/ActionIcon";
import { FileEditorCard } from "@/components/chat/FileEditorCard";
import { ActionProjectToolbar } from "@/components/workspace/ActionProjectToolbar";
import { EditableInline } from "@/components/workspace/EditableInline";
import {
  formatExportedUtc,
  isPromotedInfoJsonKey,
  parseActionProjectInfo,
  patchActionProjectInfoText,
  projectDirNameFromInfoPath,
  type InfoJsonTextField,
  type ParsedActionProjectInfo,
} from "@/lib/action-project-info-parse";

type ActionProjectInfoEditorProps = {
  path: string;
  content: string;
  cwd: string;
  onSave: (nextContent: string) => Promise<{ ok: boolean; error?: string }>;
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

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
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
}: {
  data: ParsedActionProjectInfo;
  path: string;
  content: string;
  cwd: string;
  onSave: (nextContent: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    setSaveError(null);
  }, [path]);
  const projectDir = projectDirNameFromInfoPath(path);
  const showProjectDir =
    !!projectDir
    && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectDir);
  const extraEntries = Object.entries(data.extra).filter(([key]) => !isPromotedInfoJsonKey(key));

  const displayField: InfoJsonTextField = data.kind === "action" ? "title" : "name";
  const displayValue =
    data.kind === "action" ? (data.title ?? "") : (data.name ?? data.title ?? "");
  const descriptionValue = data.description ?? "";

  const commitField = useCallback(
    async (field: InfoJsonTextField, value: string) => {
      const patched = patchActionProjectInfoText(content, field, value);
      if (!patched.ok) {
        setSaveError(patched.error);
        return;
      }
      const result = await onSave(patched.content);
      if (!result.ok) {
        setSaveError(result.error ?? "保存失败");
        return;
      }
      setSaveError(null);
    },
    [content, onSave],
  );

  return (
    <article className="project-info-editor">
        <header className="project-info-header">
          <div className="project-info-icon-wrap">
            <ActionIcon spec={data.icon} className="project-info-icon" />
          </div>
          <div className="project-info-heading">
            <EditableInline
              className="project-info-title project-info-title--editable"
              value={displayValue}
              placeholder="（无标题）"
              onCommit={(value) => commitField(displayField, value)}
            />
            {showProjectDir ? (
              <p className="project-info-folder" title={path}>
                {projectDir}
              </p>
            ) : null}
          </div>
        </header>

        <section className="project-info-description-block" aria-label="描述">
          <EditableInline
            className="project-info-description project-info-description--editable"
            value={descriptionValue}
            placeholder="添加描述…"
            multiline
            onCommit={(value) => commitField("description", value)}
          />
        </section>

        {saveError ? <p className="project-info-save-error">{saveError}</p> : null}

        <dl className="project-info-fields">
          {data.id ? (
            <InfoField label="Id" mono>
              <CopyableText value={data.id} label="Id" className="project-info-id" />
            </InfoField>
          ) : null}

          {data.callIdentifier ? (
            <InfoField label="调用" mono>
              <CopyableText value={data.callIdentifier} label="调用标识" />
            </InfoField>
          ) : null}

          {data.icon ? (
            <InfoField label="Icon" mono>
              {data.icon}
            </InfoField>
          ) : null}

          {data.exportedUtc ? (
            <InfoField label="Exported">
              <time dateTime={data.exportedUtc} title={data.exportedUtc}>
                {formatExportedUtc(data.exportedUtc)}
              </time>
            </InfoField>
          ) : null}
        </dl>

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

        {data.kind === "action" && data.id ? (
          <ActionProjectToolbar actionId={data.id} />
        ) : null}
    </article>
  );
}

export function ActionProjectInfoEditor({
  path,
  content,
  cwd,
  onSave,
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
        data={parsed.data}
        path={path}
        content={content}
        cwd={cwd}
        onSave={onSave}
      />
    </div>
  );
}
