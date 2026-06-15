"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CodeMirrorPreview } from "@/components/chat/CodeMirrorPreview";
import { useIdleCmReady } from "@/lib/use-idle-cm-ready";
import { streamingContentSignature } from "@/lib/preview-tail-lines";
import { useThrottledStreamValue } from "@/lib/use-throttled-stream-value";
import { FILE_SNAPSHOT_PREVIEW_LINES, FILE_SNAPSHOT_EXPANDED_LINES } from "@/components/chat/FileEditorCard";
import { shellTerminalBlockMaxHeight } from "@/lib/shell-terminal-layout";
import {
  resolveShellCommandEditorView,
} from "@/lib/shell-command-display";
import {
  countShellOutputLines,
  shellOutputExceedsPreviewLines,
  tailShellOutputForPreview,
} from "@/lib/shell-tool-view";
import { useFollowScrollTail } from "@/lib/use-follow-scroll-tail";
import { TerminalToolIcon } from "@/components/workspace/side-panel-view-icons";

type TerminalOutputEditorProps = {
  content: string;
  commandLine?: string;
  shellKind?: string;
  running?: boolean;
  isError?: boolean;
  /** inline chat card */
  variant?: "inline" | "panel" | "popup";
  /** Popup / panel: always show full output. Inline uses fold by default. */
  expanded?: boolean;
  followTail?: boolean;
  emptyLabel?: string;
  /** Hide OUT/LIVE badge row (summary cards with description). */
  showHeader?: boolean;
  /** Human-readable block title (e.g. shell_exec description). */
  title?: string;
  titleMeta?: string;
  titleRunning?: boolean;
  titleError?: boolean;
  /** Hide command pane until user expands (inline) or in popup expanded view. */
  foldCommandUntilExpand?: boolean;
};

function TerminalBlockTitle({
  title,
  titleMeta,
  titleRunning = false,
  titleError = false,
}: {
  title: string;
  titleMeta?: string;
  titleRunning?: boolean;
  titleError?: boolean;
}) {
  return (
    <div className="file-editor-header file-editor-header--compact terminal-output-block__title">
      <span className="terminal-output-block__icon" aria-hidden>
        <TerminalToolIcon />
      </span>
      <span className="tool-title file-snapshot-tool-title">
        <span className="file-snapshot-filename terminal-output-block__label" title={title}>
          {title}
        </span>
        {titleMeta ? (
          <span
            className={`tool-meta${titleRunning ? " tool-meta--running" : ""}${titleError ? " tool-meta--err" : ""}`}
          >
            {titleMeta}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function maxHeightForVariant(
  variant: "inline" | "panel" | "popup",
): string {
  switch (variant) {
    case "panel":
      return "100%";
    case "popup":
      return "min(52vh, 28rem)";
    case "inline":
    default:
      return shellTerminalBlockMaxHeight(FILE_SNAPSHOT_EXPANDED_LINES);
  }
}

function TerminalOutputEditorInner({
  content,
  commandLine,
  shellKind,
  running = false,
  isError = false,
  variant = "inline",
  expanded: expandedProp,
  followTail = false,
  emptyLabel = "（无输出）",
  showHeader = true,
  title,
  titleMeta,
  titleRunning = false,
  titleError = false,
  foldCommandUntilExpand: foldCommandUntilExpandProp,
}: TerminalOutputEditorProps) {
  const useBlockTitle = Boolean(title?.trim());
  const showBadgeHeader = showHeader && !useBlockTitle;
  const rootRef = useRef<HTMLDivElement>(null);
  const liveOutputRef = useRef<HTMLPreElement>(null);
  const wasRunningRef = useRef(running);
  const [userExpanded, setUserExpanded] = useState(false);
  const foldCommandUntilExpand =
    foldCommandUntilExpandProp ?? useBlockTitle;
  const hasFoldableCommand =
    foldCommandUntilExpand && Boolean(commandLine?.trim());
  const displayContent = useThrottledStreamValue(content, running);
  const outputText = displayContent.trimEnd();
  const outputLineCount = countShellOutputLines(outputText);
  const outputExceedsPreview = shellOutputExceedsPreviewLines(
    outputText,
    FILE_SNAPSHOT_PREVIEW_LINES,
  );
  const commandEditorView = commandLine
    ? resolveShellCommandEditorView(commandLine, shellKind)
    : null;

  const inlineFold = variant === "inline";
  const isExpanded = inlineFold
    ? expandedProp === true || userExpanded
    : expandedProp !== false;
  const showCommandPane =
    Boolean(commandLine?.trim())
    && (showCommandInBody(foldCommandUntilExpand, inlineFold, isExpanded, expandedProp)
      || !foldCommandUntilExpand);

  const isCompactPreview =
    inlineFold
    && !isExpanded
    && !running
    && (Boolean(outputText) || hasFoldableCommand);
  const canToggle =
    inlineFold
    && !running
    && (outputExceedsPreview || hasFoldableCommand);
  const showPreviewFade =
    isCompactPreview && outputExceedsPreview;
  const previewOutputText = useMemo(() => {
    if (!isCompactPreview || !outputExceedsPreview) {
      return outputText;
    }
    if (outputLineCount > FILE_SNAPSHOT_PREVIEW_LINES) {
      return tailShellOutputForPreview(outputText, FILE_SNAPSHOT_PREVIEW_LINES);
    }
    return outputText;
  }, [isCompactPreview, outputExceedsPreview, outputText, outputLineCount]);
  const editorOutputText = isCompactPreview ? previewOutputText : outputText;
  const displayedOutputLineCount = countShellOutputLines(editorOutputText);
  const previewLineCount = isCompactPreview
    ? (outputExceedsPreview
      ? FILE_SNAPSHOT_PREVIEW_LINES
      : Math.min(
        Math.max(displayedOutputLineCount, 1),
        FILE_SNAPSHOT_PREVIEW_LINES,
      ))
    : null;
  const showChevron = canToggle;
  const liveText = running ? (outputText || "…") : "";
  const hasOutputPane = running || Boolean(outputText);
  const unifiedScroll = showCommandPane && hasOutputPane;
  const wantOutputCm = !running && Boolean(outputText) && !isCompactPreview;
  const outputCmReady = useIdleCmReady(wantOutputCm);

  useEffect(() => {
    if (wasRunningRef.current && !running) {
      setUserExpanded(false);
    }
    wasRunningRef.current = running;
  }, [running]);

  useFollowScrollTail(liveOutputRef, running, liveText);

  useLayoutEffect(() => {
    if (!followTail || running) return;
    const root = rootRef.current;
    if (!root) return;
    const scrollEl = unifiedScroll
      ? root.querySelector<HTMLElement>(
        ".terminal-output-editor__body--unified-scroll",
      )
      : root.querySelector<HTMLElement>(
        ".terminal-output-editor__output-pane .cm-scroller",
      );
    if (!scrollEl) return;
    scrollEl.scrollTop = scrollEl.scrollHeight;
  }, [outputText, followTail, running, unifiedScroll]);

  if (
    !outputText
    && !running
    && !useBlockTitle
    && !hasFoldableCommand
  ) {
    return <p className="shell-tool-empty tool-muted">{emptyLabel}</p>;
  }

  const fillAvailable = variant === "panel";
  const cmAutoHeight =
    unifiedScroll || inlineFold ? "terminal-output-editor__cm--auto-height" : "";

  const toggleExpand = () => {
    if (!canToggle) return;
    setUserExpanded((value) => !value);
  };

  const shellClass = [
    "file-editor-card",
    "file-editor-card--compact",
    useBlockTitle ? "terminal-output-block" : "terminal-output-shell-wrap",
    running ? "file-editor-card--running" : "",
    isError ? "terminal-output-block--err" : "",
    isCompactPreview ? "file-editor-card--preview" : "",
    isExpanded && inlineFold && !running ? "file-editor-card--expanded" : "",
    showPreviewFade ? "file-editor-card--preview-fade" : "",
    canToggle ? "terminal-output-block--expandable" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const editorShellClass = [
    "terminal-output-editor",
    `terminal-output-editor--${variant}`,
    running ? "terminal-output-editor--running" : "",
    isError ? "terminal-output-editor--err" : "",
    useBlockTitle ? "terminal-output-editor--titled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const body = (
    <div
      className={[
        "terminal-output-editor__body",
        "terminal-output-editor__body--terminal",
        "file-editor-body",
        unifiedScroll ? "terminal-output-editor__body--unified-scroll" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {showCommandPane && commandEditorView ? (
        <div className="terminal-output-editor__command-pane">
          <CodeMirrorPreview
            path={commandEditorView.path}
            content={commandEditorView.content}
            language={commandEditorView.language}
            terminalDark={commandEditorView.language !== "terminal"}
            shellTerminal
            className={[
              "terminal-output-editor__cm",
              "terminal-output-editor__cm--command",
              "terminal-output-editor__cm--no-gutter",
              cmAutoHeight,
            ]
              .filter(Boolean)
              .join(" ")}
          />
        </div>
      ) : null}
      {running ? (
        <pre
          ref={liveOutputRef}
          className={[
            "terminal-output-editor__output-pane",
            "terminal-live-output",
            isError ? "terminal-output-editor__output-pane--err" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {liveText}
        </pre>
      ) : outputText ? (
        <div className="terminal-output-editor__output-pane">
          {isCompactPreview ? (
            <pre className="terminal-output-editor__output-pre">{editorOutputText}</pre>
          ) : outputCmReady ? (
            <CodeMirrorPreview
              path="shell.out.txt"
              content={editorOutputText}
              plain
              shellTerminal
              className={[
                "terminal-output-editor__cm",
                "terminal-output-editor__cm--output",
                "terminal-output-editor__cm--no-gutter",
                cmAutoHeight,
              ]
                .filter(Boolean)
                .join(" ")}
              fillAvailable={fillAvailable}
              maxHeight={
                fillAvailable || unifiedScroll
                  ? undefined
                  : maxHeightForVariant(variant)
              }
              minHeight={
                variant === "popup" && !unifiedScroll ? "8rem" : undefined
              }
            />
          ) : (
            <pre className="terminal-output-editor__output-pre terminal-output-editor__output-pre--pending">
              {editorOutputText}
            </pre>
          )}
        </div>
      ) : (
        <p className="shell-tool-empty tool-muted terminal-output-editor__output-pane terminal-output-editor__output-pane--empty">
          {emptyLabel}
        </p>
      )}
    </div>
  );

  const badgeHeader = showBadgeHeader ? (
    <div className="terminal-output-editor__head">
      {running ? (
        <>
          <span className="terminal-output-editor__badge terminal-output-editor__badge--live">
            LIVE
          </span>
          <span className="terminal-output-editor__meta tool-muted">
            {liveText === "…"
              ? "实时输出…"
              : `实时 · ${countShellOutputLines(liveText)} 行`}
          </span>
        </>
      ) : (
        <>
          <span className="terminal-output-editor__badge terminal-output-editor__badge--text">
            OUT
          </span>
          <span className="terminal-output-editor__meta tool-muted">
            {outputLineCount > 0 ? `${outputLineCount} 行` : ""}
          </span>
        </>
      )}
    </div>
  ) : null;

  const editor = (
    <div ref={rootRef} className={editorShellClass}>
      {badgeHeader}
      {body}
    </div>
  );

  const shell = (
    <div
      className={shellClass}
      style={
        previewLineCount != null
          ? ({
            "--terminal-preview-lines": String(previewLineCount),
          } as React.CSSProperties)
          : undefined
      }
      onClick={canToggle ? toggleExpand : undefined}
      onKeyDown={
        canToggle
          ? (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              toggleExpand();
            }
          }
          : undefined
      }
      role={canToggle ? "button" : undefined}
      tabIndex={canToggle ? 0 : undefined}
      aria-expanded={canToggle ? isExpanded : undefined}
    >
      {useBlockTitle ? (
        <TerminalBlockTitle
          title={title!.trim()}
          titleMeta={titleMeta}
          titleRunning={titleRunning}
          titleError={titleError}
        />
      ) : null}
      {editor}
      {showChevron ? (
        <div className="file-snapshot-expand" aria-hidden>
          <span
            className={`file-snapshot-chevron${isExpanded ? " file-snapshot-chevron--up" : ""}`}
          />
        </div>
      ) : null}
    </div>
  );

  if (useBlockTitle || inlineFold) return shell;
  return editor;
}

function showCommandInBody(
  foldCommandUntilExpand: boolean,
  inlineFold: boolean,
  isExpanded: boolean,
  expandedProp: boolean | undefined,
): boolean {
  if (!foldCommandUntilExpand) return true;
  return (inlineFold && isExpanded)
    || (!inlineFold && expandedProp !== false);
}

function terminalOutputEditorPropsEqual(
  prev: TerminalOutputEditorProps,
  next: TerminalOutputEditorProps,
): boolean {
  if (prev.running !== next.running) return false;
  if (prev.variant !== next.variant) return false;
  if (prev.expanded !== next.expanded) return false;
  if (prev.followTail !== next.followTail) return false;
  if (prev.isError !== next.isError) return false;
  if (prev.commandLine !== next.commandLine) return false;
  if (prev.shellKind !== next.shellKind) return false;
  if (next.running || prev.running) {
    return streamingContentSignature(prev.content)
      === streamingContentSignature(next.content);
  }
  return prev.content === next.content;
}

export const TerminalOutputEditor = memo(
  TerminalOutputEditorInner,
  terminalOutputEditorPropsEqual,
);
