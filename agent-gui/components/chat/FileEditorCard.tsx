"use client";

import { useMemo, useState } from "react";
import { CodeMirrorPreview } from "@/components/chat/CodeMirrorPreview";
import { CodeMirrorLineDiffView } from "@/components/chat/CodeMirrorLineDiffView";
import {
  buildInterleavedDiffDisplay,
  countLineDiffStats,
} from "@/lib/file-line-diff";
import { fileIconKindToBadgeLabel, resolveFileIconKind } from "@/lib/file-icon-kind";
import {
  basenamePath,
  countLines,
  formatWorkspacePathLabel,
  guessFileLanguage,
  splitFileSnapshotHeaderMeta,
  shouldShowFileSnapshotHeaderDetail,
} from "@/lib/workspace-file-tool";

export const FILE_SNAPSHOT_PREVIEW_LINES = 4;

export type FileEditorStatKind = "add" | "remove" | "neutral" | "range";

export type FileEditorStat = {
  label: string;
  kind: FileEditorStatKind;
  addLines?: number;
  removeLines?: number;
};

type FileEditorCardProps = {
  path: string;
  content: string;
  running?: boolean;
  stat?: FileEditorStat;
  diff?: { removed: string; added: string };
  /** collapsed: chat preview; full: popup / expanded diff without folding */
  diffMode?: "collapsed" | "full";
  variant?: "compact" | "full";
  foldSnapshot?: boolean;
  summaryMeta?: string;
  headerRunning?: boolean;
  headerError?: boolean;
  showContent?: boolean;
  /** Compact header click — open preview popup, etc. */
  onOpenPreview?: () => void;
  showHeader?: boolean;
  /** Fill workspace main editor pane; scroll inside CodeMirror. */
  fillAvailable?: boolean;
  /** Show gutter line numbers; defaults to on when fillAvailable. */
  lineNumbers?: boolean;
};

function langBadgeLabel(path: string): string {
  return fileIconKindToBadgeLabel(resolveFileIconKind(basenamePath(path)));
}

function snapshotLangClass(path: string): string {
  return guessFileLanguage(path) ?? "plain";
}

function formatCompactStat(stat: FileEditorStat): string {
  if (stat.kind === "add" && /^\d+$/.test(stat.label)) {
    return `+${stat.label}`;
  }
  return stat.label;
}

function FileEditorStatDisplay({ stat, compact }: { stat: FileEditorStat; compact: boolean }) {
  const add = stat.addLines;
  const rem = stat.removeLines;

  if (add !== undefined && rem !== undefined) {
    if (add > 0 && rem > 0) {
      return (
        <span className="file-editor-stat file-editor-stat--diff">
          <span className="file-editor-stat-part file-editor-stat--add">+{add}</span>
          <span className="file-editor-stat-part file-editor-stat--remove">-{rem}</span>
        </span>
      );
    }
    if (add > 0 && rem === 0) {
      return <span className="file-editor-stat file-editor-stat--add">+{add}</span>;
    }
    if (rem > 0 && add === 0) {
      return <span className="file-editor-stat file-editor-stat--remove">-{rem}</span>;
    }
  }

  return (
    <span className={`file-editor-stat file-editor-stat--${stat.kind}`}>
      {compact ? formatCompactStat(stat) : stat.label}
    </span>
  );
}

export function FileEditorCard({
  path,
  content,
  running = false,
  stat,
  diff,
  diffMode = "collapsed",
  variant = "full",
  foldSnapshot = false,
  summaryMeta,
  headerRunning = false,
  headerError = false,
  showContent = true,
  onOpenPreview,
  showHeader = true,
  fillAvailable = false,
  lineNumbers,
}: FileEditorCardProps) {
  const compact = variant === "compact";
  const showLineNumbers = lineNumbers ?? fillAvailable;
  const [revealed, setRevealed] = useState(() => !foldSnapshot);
  const [expanded, setExpanded] = useState(false);

  const pathLabel = formatWorkspacePathLabel(path);
  const fileName = basenamePath(path);
  const headerDetailRaw = compact
    ? splitFileSnapshotHeaderMeta(summaryMeta, fileName).detail
    : null;
  const headerDetail = shouldShowFileSnapshotHeaderDetail(headerDetailRaw)
    ? headerDetailRaw
    : null;

  const diffLineStats = useMemo(
    () => (diff ? countLineDiffStats(diff.removed, diff.added) : null),
    [diff],
  );

  const diffDisplay = useMemo(() => {
    if (!diff) return null;
    return buildInterleavedDiffDisplay(diff.removed, diff.added, {
      minEqualCollapse: diffMode === "full" ? 999_999 : undefined,
    });
  }, [diff, diffMode]);

  const diffStat = useMemo(
    () =>
      diffLineStats
        ? buildEditStatFromCounts(diffLineStats.addLines, diffLineStats.removeLines)
        : undefined,
    [diffLineStats],
  );

  const headerStat = diffStat ?? stat;

  const previewLineCount = useMemo(() => {
    if (diffDisplay) return diffDisplay.displayLineCount;
    return countLines(content);
  }, [content, diffDisplay]);

  const showBody = showContent && (!compact || revealed);
  const isCompactPreview = compact && showBody && !expanded;
  const showPreviewFade =
    isCompactPreview && previewLineCount > FILE_SNAPSHOT_PREVIEW_LINES;
  const showToggle =
    showContent
    && compact
    && ((foldSnapshot && !revealed && previewLineCount > 0)
      || (showBody && previewLineCount > FILE_SNAPSHOT_PREVIEW_LINES));

  const handleToggle = () => {
    if (!revealed) {
      setRevealed(true);
      setExpanded(false);
      return;
    }
    setExpanded((value) => !value);
  };

  return (
    <div
      className={[
        "file-editor-card",
        running ? "file-editor-card--running" : "",
        compact ? "file-editor-card--compact" : "",
        compact && (!showContent || (foldSnapshot && !revealed))
          ? "file-editor-card--folded"
          : "",
        expanded ? "file-editor-card--expanded" : "",
        isCompactPreview ? "file-editor-card--preview" : "",
        showPreviewFade ? "file-editor-card--preview-fade" : "",
        fillAvailable ? "file-editor-card--fill" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      title={path}
    >
      {showHeader && compact && onOpenPreview ? (
        <button
          type="button"
          className="file-editor-header file-editor-header--compact file-editor-header-open"
          onClick={onOpenPreview}
          aria-label={`查看 ${fileName}`}
        >
          <span
            className={`file-snapshot-lang file-snapshot-lang--${snapshotLangClass(path)}`}
            aria-hidden
          >
            {langBadgeLabel(path)}
          </span>
          <span className="tool-title file-snapshot-tool-title">
            <span className="file-snapshot-filename" title={pathLabel}>
              {fileName}
            </span>
            {headerDetail ? (
              <span
                className={`tool-meta${headerRunning ? " tool-meta--running" : ""}${headerError ? " tool-meta--err" : ""}`}
              >
                {headerDetail}
              </span>
            ) : null}
            {headerStat ? <FileEditorStatDisplay stat={headerStat} compact /> : null}
          </span>
        </button>
      ) : showHeader ? (
        <div className={`file-editor-header${compact ? " file-editor-header--compact" : ""}`}>
          {compact ? (
            <span
              className={`file-snapshot-lang file-snapshot-lang--${snapshotLangClass(path)}`}
              aria-hidden
            >
              {langBadgeLabel(path)}
            </span>
          ) : (
            <span className="file-editor-hash" aria-hidden>
              #
            </span>
          )}

          {compact ? (
            <span className="tool-title file-snapshot-tool-title">
              <span className="file-snapshot-filename" title={pathLabel}>
                {fileName}
              </span>
              {headerDetail ? (
                <span
                  className={`tool-meta${headerRunning ? " tool-meta--running" : ""}${headerError ? " tool-meta--err" : ""}`}
                >
                  {headerDetail}
                </span>
              ) : null}
              {headerStat ? <FileEditorStatDisplay stat={headerStat} compact={compact} /> : null}
            </span>
          ) : (
            <>
              <span className="file-editor-name" title={pathLabel}>
                {compact ? fileName : pathLabel}
              </span>
              {headerStat ? <FileEditorStatDisplay stat={headerStat} compact={compact} /> : null}
            </>
          )}
        </div>
      ) : null}

      {showBody ? (
        <div className="file-editor-body">
          {diff ? (
            <CodeMirrorLineDiffView
              path={path}
              removed={diff.removed}
              added={diff.added}
              collapse={diffMode !== "full"}
              scrollToFirstChange={isCompactPreview}
              fillAvailable={fillAvailable}
              lineNumbers={showLineNumbers}
            />
          ) : (
            <CodeMirrorPreview
              path={path}
              content={content}
              fillAvailable={fillAvailable}
              lineNumbers={showLineNumbers}
            />
          )}
        </div>
      ) : null}

      {showToggle ? (
        <button
          type="button"
          className="file-snapshot-expand"
          onClick={handleToggle}
          aria-expanded={revealed && expanded}
          aria-label={
            !revealed
              ? "展开预览"
              : expanded
                ? "收起预览"
                : "展开完整内容"
          }
        >
          <span
            className={`file-snapshot-chevron${revealed && expanded ? " file-snapshot-chevron--up" : ""}`}
            aria-hidden
          />
        </button>
      ) : null}
    </div>
  );
}

export function buildWriteStat(content: string): FileEditorStat {
  const lines = countLines(content);
  return { label: String(lines), kind: "add", addLines: lines, removeLines: 0 };
}

export function buildReadStat(content: string, input?: unknown): FileEditorStat {
  const lines = countLines(content);
  if (typeof input === "object" && input !== null) {
    const obj = input as Record<string, unknown>;
    const offset = typeof obj.offset === "number" ? obj.offset : 0;
    if (offset > 0) {
      return { label: `offset ${offset}`, kind: "range" };
    }
  }
  return { label: String(lines), kind: "neutral" };
}

export function buildEditStatFromCounts(
  addLines: number,
  removeLines: number,
): FileEditorStat {
  const remLines = removeLines;

  if (addLines === 0 && remLines === 0) {
    return { label: "0", kind: "neutral", addLines: 0, removeLines: 0 };
  }
  if (addLines === 0) {
    return {
      label: `-${remLines}`,
      kind: "remove",
      addLines: 0,
      removeLines: remLines,
    };
  }
  if (remLines === 0) {
    return {
      label: `+${addLines}`,
      kind: "add",
      addLines,
      removeLines: 0,
    };
  }
  return {
    label: `+${addLines} -${remLines}`,
    kind: "neutral",
    addLines,
    removeLines: remLines,
  };
}

/** +/- from LCS line diff only (no diff editor / collapse). */
export function buildEditStat(removed: string, added: string): FileEditorStat {
  const { addLines, removeLines: remLines } = countLineDiffStats(removed, added);
  return buildEditStatFromCounts(addLines, remLines);
}
