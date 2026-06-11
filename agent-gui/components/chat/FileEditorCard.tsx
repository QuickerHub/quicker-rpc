"use client";

import { memo, useMemo, useState } from "react";
import { CodeMirrorPreview } from "@/components/chat/CodeMirrorPreview";
import { StreamingCodeTailPreview } from "@/components/chat/StreamingCodeTailPreview";
import { CodeMirrorLineDiffView } from "@/components/chat/CodeMirrorLineDiffView";
import {
  buildInterleavedDiffDisplay,
  countLineDiffStats,
} from "@/lib/file-line-diff";
import { streamingContentSignature } from "@/lib/preview-tail-lines";
import { useThrottledStreamValue } from "@/lib/use-throttled-stream-value";
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
  /** e.g. "Edited" for write/edit chips (replaces lang badge). */
  editActionLabel?: string;
  /** Parent tool-summary row: full diff body, no 4-line preview clamp. */
  inlineDiffExpanded?: boolean;
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

function FileEditorCardInner({
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
  editActionLabel,
  inlineDiffExpanded = false,
}: FileEditorCardProps) {
  const compact = variant === "compact";
  const displayContent = useThrottledStreamValue(content, running);
  const showLineNumbers = lineNumbers ?? fillAvailable;
  const showDiff = Boolean(diff) && !running;
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
    () => (showDiff && diff ? countLineDiffStats(diff.removed, diff.added) : null),
    [diff, showDiff],
  );

  const collapseDiff = diffMode !== "full";

  const diffDisplay = useMemo(() => {
    if (!showDiff || !diff) return null;
    return buildInterleavedDiffDisplay(diff.removed, diff.added, {
      minEqualCollapse: collapseDiff ? undefined : 999_999,
    });
  }, [diff, showDiff, collapseDiff]);

  const diffStat = useMemo(
    () =>
      diffLineStats
        ? buildEditStatFromCounts(diffLineStats.addLines, diffLineStats.removeLines)
        : undefined,
    [diffLineStats],
  );

  const headerStat = running ? undefined : (diffStat ?? stat);

  const previewLineCount = useMemo(() => {
    if (showDiff && diffDisplay) return diffDisplay.displayLineCount;
    return countLines(displayContent);
  }, [displayContent, showDiff, diffDisplay]);

  const showBody = showContent && (!compact || revealed || inlineDiffExpanded);
  const isCompactPreview =
    compact && showBody && !expanded && !inlineDiffExpanded;
  const useStreamingPreview = running && showBody;
  const streamingTailLines = compact && isCompactPreview
    ? FILE_SNAPSHOT_PREVIEW_LINES
    : 16;
  const omittedPreviewLines = useStreamingPreview && compact && isCompactPreview
    ? Math.max(0, previewLineCount - FILE_SNAPSHOT_PREVIEW_LINES)
    : 0;
  const showPreviewFade =
    isCompactPreview
    && !useStreamingPreview
    && previewLineCount > FILE_SNAPSHOT_PREVIEW_LINES;
  const showPreviewTailFade =
    useStreamingPreview && compact && isCompactPreview && omittedPreviewLines > 0;
  const showToggle =
    !inlineDiffExpanded
    && showContent
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

  const handleHeaderClick = () => {
    if (foldSnapshot && !revealed) {
      setRevealed(true);
      setExpanded(false);
      return;
    }
    onOpenPreview?.();
  };

  const headerCanExpand = foldSnapshot && !revealed;
  const headerInteractive = Boolean(onOpenPreview) || headerCanExpand;

  const compactTitle = (
    <span className="tool-title file-snapshot-tool-title">
      {editActionLabel ? (
        <span className="file-snapshot-action">{editActionLabel}</span>
      ) : null}
      <span
        className={[
          "file-snapshot-filename",
          editActionLabel ? "file-snapshot-filename--edited" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        title={pathLabel}
      >
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
      {headerCanExpand ? (
        <span className="file-snapshot-chevron file-snapshot-chevron--inline" aria-hidden />
      ) : null}
    </span>
  );

  return (
    <div
      className={[
        "file-editor-card",
        running ? "file-editor-card--running" : "",
        compact ? "file-editor-card--compact" : "",
        compact
        && (!showContent || (foldSnapshot && !revealed && !inlineDiffExpanded))
          ? "file-editor-card--folded"
          : "",
        expanded || inlineDiffExpanded ? "file-editor-card--expanded" : "",
        isCompactPreview ? "file-editor-card--preview" : "",
        useStreamingPreview && compact ? "file-editor-card--preview-tail" : "",
        showPreviewFade ? "file-editor-card--preview-fade" : "",
        showPreviewTailFade ? "file-editor-card--preview-tail-fade" : "",
        fillAvailable ? "file-editor-card--fill" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      title={path}
    >
      {showHeader && compact && headerInteractive ? (
        <button
          type="button"
          className={[
            "file-editor-header",
            "file-editor-header--compact",
            "file-editor-header-open",
            headerCanExpand ? "file-editor-header--folded" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={handleHeaderClick}
          aria-expanded={revealed}
          aria-label={
            headerCanExpand ? `展开 ${fileName} 差异` : `查看 ${fileName}`
          }
        >
          {!editActionLabel ? (
            <span
              className={`file-snapshot-lang file-snapshot-lang--${snapshotLangClass(path)}`}
              aria-hidden
            >
              {langBadgeLabel(path)}
            </span>
          ) : null}
          {compactTitle}
        </button>
      ) : showHeader ? (
        <div className={`file-editor-header${compact ? " file-editor-header--compact" : ""}`}>
          {compact ? (
            <>
              {!editActionLabel ? (
                <span
                  className={`file-snapshot-lang file-snapshot-lang--${snapshotLangClass(path)}`}
                  aria-hidden
                >
                  {langBadgeLabel(path)}
                </span>
              ) : null}
              {compactTitle}
            </>
          ) : (
            <span className="file-editor-hash" aria-hidden>
              #
            </span>
          )}

          {compact ? null : (
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
          {showPreviewTailFade ? (
            <div className="file-snapshot-omitted" aria-hidden>
              … {omittedPreviewLines} 行已省略 …
            </div>
          ) : null}
          {useStreamingPreview ? (
            <StreamingCodeTailPreview
              path={path}
              content={displayContent}
              maxLines={streamingTailLines}
            />
          ) : showDiff && diff ? (
            <CodeMirrorLineDiffView
              path={path}
              removed={diff.removed}
              added={diff.added}
              display={diffDisplay ?? undefined}
              collapse={collapseDiff}
              scrollToFirstChange={isCompactPreview}
              fillAvailable={fillAvailable}
              lineNumbers={showLineNumbers}
              lineWrapping={!isCompactPreview}
            />
          ) : (
            <CodeMirrorPreview
              path={path}
              content={displayContent}
              fillAvailable={fillAvailable}
              lineNumbers={showLineNumbers}
              lineWrapping={!isCompactPreview}
              skipLint={compact && !fillAvailable}
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

function fileEditorCardPropsEqual(
  prev: FileEditorCardProps,
  next: FileEditorCardProps,
): boolean {
  if (prev.path !== next.path) return false;
  if (prev.running !== next.running) return false;
  if (prev.variant !== next.variant) return false;
  if (prev.diffMode !== next.diffMode) return false;
  if (prev.foldSnapshot !== next.foldSnapshot) return false;
  if (prev.showContent !== next.showContent) return false;
  if (prev.showHeader !== next.showHeader) return false;
  if (prev.fillAvailable !== next.fillAvailable) return false;
  if (prev.lineNumbers !== next.lineNumbers) return false;
  if (prev.inlineDiffExpanded !== next.inlineDiffExpanded) return false;
  if (prev.headerRunning !== next.headerRunning) return false;
  if (prev.headerError !== next.headerError) return false;
  if (prev.editActionLabel !== next.editActionLabel) return false;
  if (prev.summaryMeta !== next.summaryMeta) return false;
  if (prev.onOpenPreview !== next.onOpenPreview) return false;

  if (prev.stat !== next.stat) {
    if (!prev.stat || !next.stat) return false;
    if (
      prev.stat.label !== next.stat.label
      || prev.stat.kind !== next.stat.kind
      || prev.stat.addLines !== next.stat.addLines
      || prev.stat.removeLines !== next.stat.removeLines
    ) {
      return false;
    }
  }

  if (prev.diff !== next.diff) {
    if (!prev.diff || !next.diff) return false;
    if (prev.diff.removed !== next.diff.removed || prev.diff.added !== next.diff.added) {
      return false;
    }
  }

  if (next.running) {
    return streamingContentSignature(prev.content) === streamingContentSignature(next.content);
  }

  return prev.content === next.content;
}

export const FileEditorCard = memo(FileEditorCardInner, fileEditorCardPropsEqual);

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
