"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import {
  resolveToolPopupTab,
  storeToolPopupViewMode,
  type ToolPopupViewMode,
} from "@/lib/tool-popup-ui-prefs";
import {
  basenamePath,
  formatWorkspacePathLabel,
} from "@/lib/workspace-file-tool";
import {
  buildEditStat,
  buildReadStat,
  buildWriteStat,
  FileEditorCard,
  type FileEditorStat,
} from "./FileEditorCard";
import { ToolResultPopupTabs } from "./ToolResultPopup";
import { ToolPayloadView } from "./tool-output";

export type FileEditorPreviewPopupProps = {
  open: boolean;
  onClose: () => void;
  path: string;
  content: string;
  diff?: { removed: string; added: string };
  stat?: FileEditorStat;
  truncated?: boolean;
  totalChars?: number;
  previousSnapshotTruncated?: boolean;
  onOpenInExplorer?: () => void;
  /** When set, header tabs switch between file preview and raw tool I/O. */
  toolName?: string;
  input?: unknown;
  output?: unknown;
};

function formatPopupSubtitle(
  path: string,
  stat: FileEditorStat | undefined,
  diff: { removed: string; added: string } | undefined,
): string {
  const pathLabel = formatWorkspacePathLabel(path);
  if (stat && diff) {
    const add = stat.addLines ?? 0;
    const rem = stat.removeLines ?? 0;
    if (add > 0 || rem > 0) {
      return `${pathLabel} · +${add} -${rem}`;
    }
  }
  return pathLabel;
}

export function FileEditorPreviewPopup({
  open,
  onClose,
  path,
  content,
  diff,
  stat: statProp,
  truncated,
  totalChars,
  previousSnapshotTruncated,
  onOpenInExplorer,
  toolName,
  input,
  output,
}: FileEditorPreviewPopupProps) {
  const panelId = useId();
  const fileName = basenamePath(path);
  const hasRawPayload = input !== undefined || output !== undefined;
  const [tab, setTab] = useState<ToolPopupViewMode>("visual");

  const setTabPersisted = useCallback((next: ToolPopupViewMode) => {
    setTab(next);
    storeToolPopupViewMode(next);
  }, []);

  const stat =
    statProp
    ?? (diff
      ? buildEditStat(diff.removed, diff.added)
      : content
        ? buildWriteStat(content)
        : undefined);

  useEffect(() => {
    if (!open) return;
    setTab(resolveToolPopupTab(true));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const subtitle = formatPopupSubtitle(path, stat, diff);

  const dialog = (
    <div className="tool-result-popup-overlay tool-file-editor-popup-overlay">
      <button
        type="button"
        className="tool-result-popup-backdrop"
        aria-label="关闭"
        onClick={onClose}
      />
      <div
        id={panelId}
        className="tool-result-popup-panel tool-file-editor-popup-panel"
        role="dialog"
        aria-modal="true"
        aria-label={fileName}
      >
        <div className="tool-result-popup-head">
          <div className="tool-result-popup-head-main">
            <div className="tool-result-popup-head-text">
              <span className="tool-result-popup-title">{fileName}</span>
              {subtitle ? (
                <span className="tool-result-popup-subtitle">{subtitle}</span>
              ) : null}
            </div>
            {hasRawPayload ? (
              <ToolResultPopupTabs
                tab={tab}
                hasVisual
                onTabChange={setTabPersisted}
              />
            ) : null}
          </div>
          <div className="tool-result-popup-head-actions">
            {onOpenInExplorer ? (
              <button
                type="button"
                className="tool-docs-popup-side-btn"
                onClick={onOpenInExplorer}
              >
                侧栏打开
              </button>
            ) : null}
            <button
              type="button"
              className="tool-result-popup-close"
              aria-label="关闭"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>
        <div
          className={`tool-file-editor-popup-body${tab === "source" ? " tool-file-editor-popup-body--source" : ""}`}
          role={hasRawPayload ? "tabpanel" : undefined}
          aria-labelledby={
            hasRawPayload
              ? tab === "visual"
                ? "tool-popup-tab-visual"
                : "tool-popup-tab-source"
              : undefined
          }
        >
          {tab === "source" && hasRawPayload ? (
            <div className="tool-body tool-body--debug tool-body--popup-source">
              {input !== undefined ? (
                <ToolPayloadView
                  label="请求"
                  value={input}
                  rawOnly
                  toolName={toolName}
                  input={input}
                  output={output}
                />
              ) : null}
              {output !== undefined ? (
                <ToolPayloadView
                  label="结果"
                  value={output}
                  rawOnly
                  toolName={toolName}
                  input={input}
                  output={output}
                />
              ) : null}
            </div>
          ) : (
            <>
              <FileEditorCard
                path={path}
                content={content}
                stat={stat}
                diff={diff}
                diffMode="full"
                variant="full"
                showHeader={false}
                showContent
                fillAvailable
                lineNumbers
              />
              {truncated ? (
                <p className="file-editor-footnote file-editor-footnote--warn tool-file-editor-popup-footnote">
                  内容已截断
                  {totalChars !== undefined ? ` · 文件共 ${totalChars} 字符` : ""}
                </p>
              ) : null}
              {previousSnapshotTruncated ? (
                <p className="file-editor-footnote file-editor-footnote--warn tool-file-editor-popup-footnote">
                  写入前快照已截断，diff 可能不完整
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(dialog, document.body)
    : dialog;
}

/** Stat for popup header from tool preview payload. */
export function fileEditorStatFromPreview(
  toolName: string,
  preview: {
    content: string;
    diff?: { removed: string; added: string };
  },
  input?: unknown,
): FileEditorStat | undefined {
  if (preview.diff) {
    return buildEditStat(preview.diff.removed, preview.diff.added);
  }
  if (
    toolName === "workspace_action_file_read"
    || toolName === "workspace_action_read_data"
  ) {
    return buildReadStat(preview.content, input);
  }
  if (
    toolName === "workspace_action_file_write"
    || toolName === "workspace_action_write_data"
  ) {
    return buildWriteStat(preview.content);
  }
  return undefined;
}
