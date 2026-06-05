"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { TextEditorStatusBar } from "@/components/chat/TextEditorStatusBar";
import {
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
};

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
}: CodeMirrorPreviewProps) {
  const showEditorStatusBar = showStatusBar ?? fillAvailable;
  const [stats, setStats] = useState<CodeMirrorEditorStats>(() => statsFromTextContent(content));
  const setStatsRef = useRef(setStats);
  setStatsRef.current = setStats;

  useEffect(() => {
    setStats((prev) => {
      const next = statsFromTextContent(content);
      return codeMirrorEditorStatsEqual(prev, next) ? prev : next;
    });
  }, [content]);

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
        lintSourceText: plain ? "" : content,
      }),
      statsExtension,
    ],
    [path, language, lineNumbers, plain, terminalDark, content, statsExtension],
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
        onCreateEditor={(view) => {
          const next = computeCodeMirrorEditorStats(view.state);
          setStatsRef.current((prev) =>
            codeMirrorEditorStatsEqual(prev, next) ? prev : next,
          );
        }}
      />
      {showEditorStatusBar ? <TextEditorStatusBar stats={stats} /> : null}
    </div>
  );
}
