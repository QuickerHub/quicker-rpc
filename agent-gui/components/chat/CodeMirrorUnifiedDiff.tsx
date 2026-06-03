"use client";

import { unifiedMergeView } from "@codemirror/merge";
import { EditorView } from "@codemirror/view";
import { useEffect, useMemo, useRef } from "react";
import {
  buildPreviewCodeMirrorExtensions,
} from "@/lib/codemirror-setup";

type CodeMirrorUnifiedDiffProps = {
  path: string;
  removed: string;
  added: string;
  className?: string;
  maxHeight?: string;
  minHeight?: string;
};

export function CodeMirrorUnifiedDiff({
  path,
  removed,
  added,
  className,
  maxHeight,
  minHeight,
}: CodeMirrorUnifiedDiffProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const extensions = useMemo(
    () => [
      ...buildPreviewCodeMirrorExtensions(path),
      unifiedMergeView({
        original: removed,
        mergeControls: false,
        gutter: true,
      }),
    ],
    [path, removed],
  );

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    viewRef.current?.destroy();
    viewRef.current = new EditorView({
      parent,
      doc: added,
      extensions,
    });

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [added, extensions]);

  return (
    <div
      ref={containerRef}
      className={`file-editor-cm file-editor-cm--diff${className ? ` ${className}` : ""}`}
      style={{
        maxHeight,
        minHeight,
      }}
      role="region"
      aria-label="文件差异"
    />
  );
}
