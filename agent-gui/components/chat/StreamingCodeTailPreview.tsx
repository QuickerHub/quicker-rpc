"use client";

import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { guessFileLanguage } from "@/lib/workspace-file-tool";

const DEFAULT_TAIL_LINES = 4;

type StreamingCodeTailPreviewProps = {
  path: string;
  content: string;
  maxLines?: number;
};

function streamingPreviewMaxHeight(maxLines: number): string {
  return `calc(0.72rem * 1.45 * ${maxLines} + 0.35rem)`;
}

function StreamingCodeTailPreviewInner({
  path,
  content,
  maxLines = DEFAULT_TAIL_LINES,
}: StreamingCodeTailPreviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lang = useMemo(() => guessFileLanguage(path) ?? "plain", [path]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [content]);

  return (
    <div
      ref={scrollRef}
      className="file-editor-streaming-scroll"
      style={{ maxHeight: streamingPreviewMaxHeight(maxLines) }}
    >
      <pre
        className={`file-editor-streaming-pre file-editor-streaming-pre--${lang}`}
      >
        {content}
      </pre>
    </div>
  );
}

export const StreamingCodeTailPreview = memo(
  StreamingCodeTailPreviewInner,
  (prev, next) =>
    prev.path === next.path
    && prev.maxLines === next.maxLines
    && prev.content === next.content,
);
