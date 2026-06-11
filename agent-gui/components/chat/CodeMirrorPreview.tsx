"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { TextEditorStatusBar } from "@/components/chat/TextEditorStatusBar";
import {
  codeMirrorEditorStatsEqual,
  computeCodeMirrorEditorStats,
  createCodeMirrorStatsExtension,
  statsFromTextContent,
  type CodeMirrorEditorStats,
} from "@/lib/codemirror-editor-stats";
import { streamingContentSignature } from "@/lib/preview-tail-lines";
import {
  buildPreviewCodeMirrorExtensions,
  workspaceCodeMirrorUiTheme,
} from "@/lib/codemirror-setup";

/** Above this size, skip Lezer syntax highlighting in previews. */
const LARGE_PREVIEW_PLAIN_CHARS = 32_000;

type CodeMirrorPreviewProps = {
  path: string;
  content: string;
  language?: string;
  className?: string;
  maxHeight?: string;
  minHeight?: string;
  fillAvailable?: boolean;
  lineNumbers?: boolean;
  showStatusBar?: boolean;
  plain?: boolean;
  terminalDark?: boolean;
  lineWrapping?: boolean;
  skipLint?: boolean;
  scrollToTail?: boolean;
};

function scrollEditorToTail(view: EditorView): void {
  requestAnimationFrame(() => {
    const dom = view.scrollDOM;
    dom.scrollTop = dom.scrollHeight;
  });
}

function CodeMirrorPreviewInner({
  path,
  content,
  language,
  className,
  maxHeight,
  minHeight,
  fillAvailable = false,
  lineNumbers = false,
  showStatusBar,
  plain = false,
  terminalDark = false,
  lineWrapping = true,
  skipLint = false,
  scrollToTail = false,
}: CodeMirrorPreviewProps) {
  const showEditorStatusBar = showStatusBar ?? fillAvailable;
  const effectivePlain = plain || content.length > LARGE_PREVIEW_PLAIN_CHARS;
  const viewRef = useRef<EditorView | null>(null);
  const [stats, setStats] = useState<CodeMirrorEditorStats>(() =>
    showEditorStatusBar ? statsFromTextContent(content) : statsFromTextContent(""),
  );
  const setStatsRef = useRef(setStats);
  setStatsRef.current = setStats;

  useEffect(() => {
    if (!showEditorStatusBar) return;
    setStats((prev) => {
      const next = statsFromTextContent(content);
      return codeMirrorEditorStatsEqual(prev, next) ? prev : next;
    });
  }, [content, showEditorStatusBar]);

  useEffect(() => {
    if (!scrollToTail || !viewRef.current) return;
    scrollEditorToTail(viewRef.current);
  }, [content, scrollToTail]);

  const statsExtension = useMemo(
    () =>
      createCodeMirrorStatsExtension((next) => {
        setStatsRef.current((prev) =>
          codeMirrorEditorStatsEqual(prev, next) ? prev : next,
        );
      }),
    [],
  );

  const extensions = useMemo(
    () => [
      ...buildPreviewCodeMirrorExtensions(path, {
        language,
        lineNumbers,
        plain: effectivePlain,
        terminalDark,
        lineWrapping,
        lintSourceText: skipLint ? "" : undefined,
      }),
      ...(showEditorStatusBar ? [statsExtension] : []),
    ],
    [
      path,
      language,
      lineNumbers,
      effectivePlain,
      terminalDark,
      lineWrapping,
      skipLint,
      showEditorStatusBar,
      statsExtension,
    ],
  );

  const editorHeight = fillAvailable ? "100%" : "auto";

  return (
    <div
      className={[
        "file-editor-cm",
        fillAvailable ? "file-editor-cm--fill" : "",
        showEditorStatusBar ? "file-editor-cm--with-status" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        maxHeight: fillAvailable ? undefined : maxHeight,
        minHeight: fillAvailable ? undefined : minHeight,
      }}
    >
      <CodeMirror
        value={content}
        extensions={extensions}
        theme={workspaceCodeMirrorUiTheme}
        editable={false}
        readOnly
        basicSetup={false}
        height={editorHeight}
        maxHeight={fillAvailable ? undefined : maxHeight}
        minHeight={fillAvailable ? undefined : minHeight}
        onCreateEditor={
          showEditorStatusBar || scrollToTail
            ? (view) => {
                viewRef.current = view;
                if (showEditorStatusBar) {
                  const next = computeCodeMirrorEditorStats(view.state);
                  setStatsRef.current((prev) =>
                    codeMirrorEditorStatsEqual(prev, next) ? prev : next,
                  );
                }
                if (scrollToTail) {
                  scrollEditorToTail(view);
                }
              }
            : undefined
        }
        onUpdate={
          scrollToTail
            ? (update) => {
                viewRef.current = update.view;
                if (update.docChanged) {
                  scrollEditorToTail(update.view);
                }
              }
            : undefined
        }
      />
      {showEditorStatusBar ? <TextEditorStatusBar stats={stats} /> : null}
    </div>
  );
}

function codeMirrorPreviewPropsEqual(
  prev: CodeMirrorPreviewProps,
  next: CodeMirrorPreviewProps,
): boolean {
  if (prev.path !== next.path) return false;
  if (prev.language !== next.language) return false;
  if (prev.className !== next.className) return false;
  if (prev.maxHeight !== next.maxHeight) return false;
  if (prev.minHeight !== next.minHeight) return false;
  if (prev.fillAvailable !== next.fillAvailable) return false;
  if (prev.lineNumbers !== next.lineNumbers) return false;
  if (prev.showStatusBar !== next.showStatusBar) return false;
  if (prev.plain !== next.plain) return false;
  if (prev.terminalDark !== next.terminalDark) return false;
  if (prev.lineWrapping !== next.lineWrapping) return false;
  if (prev.skipLint !== next.skipLint) return false;
  if (prev.scrollToTail !== next.scrollToTail) return false;
  if (prev.scrollToTail) {
    return streamingContentSignature(prev.content)
      === streamingContentSignature(next.content);
  }
  return prev.content === next.content;
}

export const CodeMirrorPreview = memo(
  CodeMirrorPreviewInner,
  codeMirrorPreviewPropsEqual,
);
