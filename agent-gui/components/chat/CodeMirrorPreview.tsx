"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { TextEditorStatusBar } from "@/components/chat/TextEditorStatusBar";import {
  codeMirrorEditorStatsEqual,
  computeCodeMirrorEditorStats,
  createCodeMirrorStatsExtension,
  statsFromTextContent,
  type CodeMirrorEditorStats,
} from "@/lib/codemirror-editor-stats";
import {
  buildPreviewCodeMirrorExtensions,
  workspaceCodeMirrorUiTheme,
} from "@/lib/codemirror-setup";

type CodeMirrorPreviewProps = {
  path: string;
  content: string;
  language?: string;
  className?: string;
  /** When set, constrains editor height (compact chat snapshots). */
  maxHeight?: string;
  minHeight?: string;
  /** Fill parent flex area; vertical scroll on CodeMirror scroller. */
  fillAvailable?: boolean;
  /** Show gutter line numbers (default false). */
  lineNumbers?: boolean;
  /** Show bottom status bar; defaults to on when fillAvailable. */
  showStatusBar?: boolean;
  /** Monospace plain text without syntax highlighting. */
  plain?: boolean;
  /** Dark terminal command palette (shell_exec command pane). */
  terminalDark?: boolean;
  /** Default true; compact chat code snapshots use false. */
  lineWrapping?: boolean;
  /** Skip interpolation lint (compact chat previews). */
  skipLint?: boolean;
  /** Keep the viewport pinned to the last lines (streaming compact preview). */
  scrollToTail?: boolean;
};

function scrollEditorToTail(view: EditorView): void {
  requestAnimationFrame(() => {
    const dom = view.scrollDOM;
    dom.scrollTop = dom.scrollHeight;
  });
}

export function CodeMirrorPreview({
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
        plain,
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
      plain,
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
