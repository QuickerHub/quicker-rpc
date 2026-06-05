"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CodeMirrorPreview } from "@/components/chat/CodeMirrorPreview";
import { FILE_SNAPSHOT_PREVIEW_LINES } from "@/components/chat/FileEditorCard";
import {
  resolveShellCommandDisplay,
  shouldUseStructuredShellCommand,
} from "@/lib/shell-command-display";
import {
  countShellOutputLines,
  tailShellOutputForPreview,
} from "@/lib/shell-tool-view";

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
        &gt;_
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
      return "min(360px, 45vh)";
  }
}

export function TerminalOutputEditor({
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
  const wasRunningRef = useRef(running);
  const [userExpanded, setUserExpanded] = useState(false);
  const foldCommandUntilExpand =
    foldCommandUntilExpandProp ?? useBlockTitle;
  const hasFoldableCommand =
    foldCommandUntilExpand && Boolean(commandLine?.trim());
  const outputText = content.trimEnd();
  const outputLineCount = countShellOutputLines(outputText);
  const commandDisplay = commandLine
    ? resolveShellCommandDisplay(commandLine, shellKind)
    : null;
  const commandTranscript = commandLine ? `$ ${commandLine}` : "";
  const structuredCommand =
    commandDisplay && shouldUseStructuredShellCommand(commandDisplay);

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
    && (outputLineCount > FILE_SNAPSHOT_PREVIEW_LINES || hasFoldableCommand);
  const showPreviewFade =
    isCompactPreview && outputLineCount > FILE_SNAPSHOT_PREVIEW_LINES;
  const previewOutputText = useMemo(() => {
    if (!isCompactPreview || outputLineCount <= FILE_SNAPSHOT_PREVIEW_LINES) {
      return outputText;
    }
    return tailShellOutputForPreview(outputText, FILE_SNAPSHOT_PREVIEW_LINES);
  }, [isCompactPreview, outputText, outputLineCount]);
  const editorOutputText = isCompactPreview ? previewOutputText : outputText;
  const displayedOutputLineCount = countShellOutputLines(editorOutputText);
  const previewLineCount = isCompactPreview
    ? Math.min(
      Math.max(displayedOutputLineCount, 1),
      FILE_SNAPSHOT_PREVIEW_LINES,
    )
    : null;
  const showChevron = canToggle;
  const liveText = running ? (outputText || "…") : "";

  useEffect(() => {
    if (wasRunningRef.current && !running) {
      setUserExpanded(false);
    }
    wasRunningRef.current = running;
  }, [running]);

  useLayoutEffect(() => {
    if (!followTail && !running) return;
    const root = rootRef.current;
    if (!root) return;
    const scroller = running
      ? root.querySelector<HTMLElement>(".terminal-live-output")
      : root.querySelector<HTMLElement>(
        ".terminal-output-editor__output-pane .cm-scroller",
      );
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [outputText, liveText, followTail, running, showCommandPane]);

  useLayoutEffect(() => {
    if (!isCompactPreview) return;
    const root = rootRef.current;
    if (!root) return;
    const scroller = root.querySelector<HTMLElement>(
      ".terminal-output-editor__output-pane .cm-scroller",
    );
    if (!scroller) return;
    // Single long line wraps in CM: clip shows head by default — scroll to tail.
    if (outputLineCount <= FILE_SNAPSHOT_PREVIEW_LINES) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  }, [isCompactPreview, editorOutputText, outputLineCount]);

  if (
    !outputText
    && !running
    && !useBlockTitle
    && !hasFoldableCommand
  ) {
    return <p className="shell-tool-empty tool-muted">{emptyLabel}</p>;
  }

  const fillAvailable = variant === "panel";
  const cmAutoHeight = inlineFold ? "terminal-output-editor__cm--auto-height" : "";

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
    <div className="terminal-output-editor__body terminal-output-editor__body--terminal file-editor-body">
      {showCommandPane ? (
        <div className="terminal-output-editor__command-pane">
          {structuredCommand && commandDisplay ? (
            <div className="terminal-output-editor__command-line">
              <span className="terminal-output-editor__prompt" aria-hidden>
                {commandDisplay.prompt}
              </span>
              {commandDisplay.invocationPrefix ? (
                <span className="terminal-output-editor__invocation">
                  {commandDisplay.invocationPrefix}
                </span>
              ) : null}
              <CodeMirrorPreview
                path="shell.command.ps1"
                content={commandDisplay.scriptText}
                language={commandDisplay.highlightLanguage}
                terminalDark
                className={[
                  "terminal-output-editor__cm",
                  "terminal-output-editor__cm--command",
                  "terminal-output-editor__cm--command-inline",
                  "terminal-output-editor__cm--no-gutter",
                  cmAutoHeight,
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            </div>
          ) : (
            <CodeMirrorPreview
              path="shell.command"
              content={commandTranscript}
              language="terminal"
              className={[
                "terminal-output-editor__cm",
                "terminal-output-editor__cm--command",
                "terminal-output-editor__cm--no-gutter",
                cmAutoHeight,
              ]
                .filter(Boolean)
                .join(" ")}
            />
          )}
        </div>
      ) : null}
      {running ? (
        <pre
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
          <CodeMirrorPreview
            path="shell.out.txt"
            content={editorOutputText}
            plain
            className={[
              "terminal-output-editor__cm",
              "terminal-output-editor__cm--output",
              "terminal-output-editor__cm--no-gutter",
              cmAutoHeight,
            ]
              .filter(Boolean)
              .join(" ")}
            fillAvailable={fillAvailable}
            maxHeight={fillAvailable ? undefined : maxHeightForVariant(variant)}
            minHeight={variant === "popup" ? "8rem" : undefined}
          />
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
