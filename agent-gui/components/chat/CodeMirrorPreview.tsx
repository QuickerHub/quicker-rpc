"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { TextEditorStatusBar } from "@/components/chat/TextEditorStatusBar";
import {
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
}: CodeMirrorPreviewProps) {
  const showEditorStatusBar = showStatusBar ?? fillAvailable;
  const [stats, setStats] = useState<CodeMirrorEditorStats>(() => statsFromTextContent(content));
  const setStatsRef = useRef(setStats);
  setStatsRef.current = setStats;

  useEffect(() => {
    setStats(statsFromTextContent(content));
  }, [content]);

  const statsExtension = useMemo(
    () => createCodeMirrorStatsExtension((next) => setStatsRef.current(next)),
    [],
  );

  const extensions = useMemo(
    () => [
      ...buildPreviewCodeMirrorExtensions(path, { language, lineNumbers }),
      statsExtension,
    ],
    [path, language, lineNumbers, statsExtension],
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
          setStatsRef.current(computeCodeMirrorEditorStats(view.state));
        }}
      />
      {showEditorStatusBar ? <TextEditorStatusBar stats={stats} /> : null}
    </div>
  );
}
