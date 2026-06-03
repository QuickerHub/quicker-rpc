"use client";

import type { JSX } from "react";
import type { CodeMirrorEditorStats } from "@/lib/codemirror-editor-stats";
import { formatCharCount } from "@/lib/workspace-file-tool";

export type TextEditorStatusBarProps = {
  stats: CodeMirrorEditorStats;
  className?: string;
};

export function TextEditorStatusBar({
  stats,
  className,
}: TextEditorStatusBarProps): JSX.Element {
  const { lineCount, charCount, selectionCharCount, cursorLine, cursorColumn } = stats;

  return (
    <footer
      className={["text-editor-status-bar", className ?? ""].filter(Boolean).join(" ")}
      aria-label="编辑器状态"
    >
      <span className="text-editor-status-bar-item">
        第 {cursorLine} 行，第 {cursorColumn} 列
      </span>
      {selectionCharCount > 0 ? (
        <span className="text-editor-status-bar-item">已选 {selectionCharCount} 字符</span>
      ) : null}
      <span className="text-editor-status-bar-spacer" aria-hidden />
      <span className="text-editor-status-bar-item">{lineCount} 行</span>
      <span className="text-editor-status-bar-item">{formatCharCount(charCount)}</span>
    </footer>
  );
}
