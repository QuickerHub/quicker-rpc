"use client";



import { useMemo, useState } from "react";

import { resolveHighlightLanguage, tokenizeCode } from "@/lib/code-highlight";
import {
  computeLineDiff,
  countLineDiffStats,
  countUnifiedDiffDisplayLines,
  lineDiffGutterSymbol,
} from "@/lib/file-line-diff";
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

  /** Line counts for compact diff-style stats (+N / -N). */
  addLines?: number;

  removeLines?: number;

};



type FileEditorCardProps = {

  path: string;

  content: string;

  running?: boolean;

  stat?: FileEditorStat;

  /** When set, renders a +/- diff instead of a single code block. */

  diff?: { removed: string; added: string };

  /** Compact snapshot for chat tools; full editor in workspace pane. */

  variant?: "compact" | "full";

  /**
   * true: header-only until expanded (read).
   * false: show body with ~4-line clamp by default (write/edit).
   */

  foldSnapshot?: boolean;

  /** Compact header: filename + optional detail from tool summary + line stat. */
  summaryMeta?: string;
  headerRunning?: boolean;
  headerError?: boolean;

  /** false: compact header only (read-data). */
  showContent?: boolean;

  /** Compact chat snapshot: open file in workspace explorer. */
  onOpenInExplorer?: () => void;

  /** Workspace pane hides the path header (tabs already show the file). */
  showHeader?: boolean;

};



function langBadgeLabel(path: string): string {
  const lang = guessFileLanguage(path);

  if (!lang) return "TXT";

  const map: Record<string, string> = {

    json: "JSON",

    csharp: "C#",

    markdown: "MD",

    javascript: "JS",

    typescript: "TS",

    tsx: "TSX",

    jsx: "JSX",

    powershell: "PS",

    shell: "SH",

    yaml: "YAML",

    html: "HTML",

    css: "CSS",

    xml: "XML",

    text: "TXT",

  };

  return map[lang] ?? lang.slice(0, 4).toUpperCase();

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

      return (

        <span className="file-editor-stat file-editor-stat--add">+{add}</span>

      );

    }

    if (rem > 0 && add === 0) {

      return (

        <span className="file-editor-stat file-editor-stat--remove">-{rem}</span>

      );

    }

  }

  return (

    <span className={`file-editor-stat file-editor-stat--${stat.kind}`}>

      {compact ? formatCompactStat(stat) : stat.label}

    </span>

  );

}



function HighlightedCode({

  code,

  path,

}: {

  code: string;

  path: string;

}) {

  const lang = resolveHighlightLanguage(path, code, guessFileLanguage);

  const tokens = tokenizeCode(code, lang);



  return (

    <code className={`file-editor-code${lang ? ` file-editor-code--${lang}` : ""}`}>

      {tokens.map((token, index) => (

        <span key={index} className={`file-editor-token file-editor-token--${token.type}`}>

          {token.text}

        </span>

      ))}

    </code>

  );

}



function DiffLineContent({ text, path }: { text: string; path: string }) {
  const display = text.length > 0 ? text : " ";
  return <HighlightedCode code={display} path={path} />;
}

function UnifiedDiffView({
  removed,
  added,
  path,
}: {
  removed: string;
  added: string;
  path: string;
}) {
  const rows = useMemo(
    () => computeLineDiff(removed, added),
    [removed, added],
  );

  if (rows.length === 0) return null;

  return (
    <div className="file-editor-diff" role="region" aria-label="文件差异">
      {rows.map((row, index) => (
        <div
          key={index}
          className={`file-editor-diff-line file-editor-diff-line--${row.kind}`}
        >
          <span
            className="file-editor-diff-gutter"
            aria-hidden
          >
            {lineDiffGutterSymbol(row.kind)}
          </span>
          <pre className="file-editor-diff-content">
            <DiffLineContent text={row.text} path={path} />
          </pre>
        </div>
      ))}
    </div>
  );
}



export function FileEditorCard({

  path,

  content,

  running = false,

  stat,

  diff,

  variant = "full",

  foldSnapshot = false,

  summaryMeta,

  headerRunning = false,

  headerError = false,

  showContent = true,

  onOpenInExplorer,

  showHeader = true,

}: FileEditorCardProps) {

  const compact = variant === "compact";

  // read: header-only until expand; write/edit: body visible but 4-line clamp until expand
  const [revealed, setRevealed] = useState(() => !foldSnapshot);

  const [expanded, setExpanded] = useState(false);

  const lang = resolveHighlightLanguage(path, content, guessFileLanguage);

  const pathLabel = formatWorkspacePathLabel(path);

  const fileName = basenamePath(path);

  const headerDetailRaw = compact
    ? splitFileSnapshotHeaderMeta(summaryMeta, fileName).detail
    : null;
  const headerDetail = shouldShowFileSnapshotHeaderDetail(headerDetailRaw)
    ? headerDetailRaw
    : null;

  const previewLineCount = useMemo(() => {
    if (diff) {
      return countUnifiedDiffDisplayLines(diff.removed, diff.added);
    }
    return countLines(content);
  }, [content, diff]);



  const showBody = showContent && (!compact || revealed);

  const lineClamp =

    compact

    && showBody

    && previewLineCount > FILE_SNAPSHOT_PREVIEW_LINES

    && !expanded;

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

        lineClamp ? "file-editor-card--collapsed" : "",

      ]

        .filter(Boolean)

        .join(" ")}

      title={path}

    >

      {showHeader && compact && onOpenInExplorer ? (
        <button
          type="button"
          className="file-editor-header file-editor-header--compact file-editor-header-open"
          onClick={onOpenInExplorer}
          aria-label={`在右侧打开 ${fileName}`}
        >
          <span
            className={`file-snapshot-lang file-snapshot-lang--${lang ?? "plain"}`}
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
            {stat ? (
              <FileEditorStatDisplay stat={stat} compact />
            ) : null}
          </span>
        </button>
      ) : showHeader ? (
        <div className={`file-editor-header${compact ? " file-editor-header--compact" : ""}`}>
          {compact ? (
            <span
              className={`file-snapshot-lang file-snapshot-lang--${lang ?? "plain"}`}
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
              {stat ? (
                <FileEditorStatDisplay stat={stat} compact={compact} />
              ) : null}
            </span>
          ) : (
            <>
              <span className="file-editor-name" title={pathLabel}>
                {compact ? fileName : pathLabel}
              </span>
              {stat ? (
                <FileEditorStatDisplay stat={stat} compact={compact} />
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {showBody ? (

        <div className="file-editor-body">

          {diff ? (

            <UnifiedDiffView removed={diff.removed} added={diff.added} path={path} />

          ) : (

            <pre className={`file-editor-pre${lang ? ` file-editor-pre--${lang}` : ""}`}>

              <HighlightedCode code={content} path={path} />

            </pre>

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



export function buildReadStat(

  content: string,

  input?: unknown,

): FileEditorStat {

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



export function buildEditStat(removed: string, added: string): FileEditorStat {
  const { addLines, removeLines: remLines } = countLineDiffStats(removed, added);

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


