"use client";

import { memo, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { createDiffLineKindsExtension } from "@/lib/codemirror-diff-extensions";
import {
  buildInterleavedDiffDisplay,
  FILE_DIFF_CONTEXT_LINES,
  FILE_DIFF_MIN_EQUAL_COLLAPSE,
  type InterleavedDiffDisplay,
} from "@/lib/file-line-diff";
import {
  buildPreviewCodeMirrorExtensions,
  workspaceCodeMirrorUiTheme,
} from "@/lib/codemirror-setup";

type CodeMirrorLineDiffViewProps = {
  path: string;
  removed: string;
  added: string;
  /** Precomputed interleaved diff — avoids duplicate LCS when parent already built display. */
  display?: InterleavedDiffDisplay;
  /** Override language; defaults to guess from path (e.g. json for data.json). */
  language?: string;
  /** When true, fold long unchanged runs (chat preview). */
  collapse?: boolean;
  /** Scroll to first insert/delete line after mount (compact preview). */
  scrollToFirstChange?: boolean;
  className?: string;
  maxHeight?: string;
  minHeight?: string;
  lineNumbers?: boolean;
  fillAvailable?: boolean;
  /** Default true; compact chat code snapshots use false. */
  lineWrapping?: boolean;
};

function CodeMirrorLineDiffViewInner({
  path,
  removed,
  added,
  display: displayProp,
  language,
  collapse = true,
  scrollToFirstChange = false,
  className,
  maxHeight,
  minHeight,
  lineNumbers = false,
  fillAvailable = false,
  lineWrapping = true,
}: CodeMirrorLineDiffViewProps) {
  const display = useMemo(
    () =>
      displayProp
      ?? buildInterleavedDiffDisplay(removed, added, {
        contextLines: FILE_DIFF_CONTEXT_LINES,
        minEqualCollapse: collapse ? FILE_DIFF_MIN_EQUAL_COLLAPSE : 999_999,
      }),
    [displayProp, removed, added, collapse],
  );

  const lintSourceText = useMemo(
    () => `${removed}\n${added}`,
    [removed, added],
  );

  const extensions = useMemo(
    () => [
      ...buildPreviewCodeMirrorExtensions(path, {
        language,
        lineNumbers,
        lineWrapping,
        lintSourceText,
      }),
      createDiffLineKindsExtension(display.lineKinds, { scrollToFirstChange }),
    ],
    [path, language, lineNumbers, lineWrapping, lintSourceText, display.lineKinds, scrollToFirstChange],
  );

  const editorHeight = fillAvailable ? "100%" : "auto";

  return (
    <div
      className={[
        "file-editor-cm",
        "file-editor-cm--diff",
        "file-editor-cm--line-diff",
        fillAvailable ? "file-editor-cm--fill" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        maxHeight: fillAvailable ? undefined : maxHeight,
        minHeight: fillAvailable ? undefined : minHeight,
      }}
      role="region"
      aria-label="文件差异"
    >
      <CodeMirror
        value={display.text}
        extensions={extensions}
        theme={workspaceCodeMirrorUiTheme}
        editable={false}
        readOnly
        basicSetup={false}
        height={editorHeight}
        maxHeight={fillAvailable ? undefined : maxHeight}
        minHeight={fillAvailable ? undefined : minHeight}
      />
    </div>
  );
}

export const CodeMirrorLineDiffView = memo(CodeMirrorLineDiffViewInner);
