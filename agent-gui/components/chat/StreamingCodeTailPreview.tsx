"use client";

import { memo, useMemo } from "react";
import { extractTailLinesPreview } from "@/lib/preview-tail-lines";
import { guessFileLanguage } from "@/lib/workspace-file-tool";

const DEFAULT_TAIL_LINES = 4;

type StreamingCodeTailPreviewProps = {
  path: string;
  content: string;
  maxLines?: number;
};

function StreamingCodeTailPreviewInner({
  path,
  content,
  maxLines = DEFAULT_TAIL_LINES,
}: StreamingCodeTailPreviewProps) {
  const { tail, omitted } = useMemo(
    () => extractTailLinesPreview(content, maxLines),
    [content, maxLines],
  );
  const lang = useMemo(() => guessFileLanguage(path) ?? "plain", [path]);

  return (
    <>
      {omitted > 0 ? (
        <div className="file-snapshot-omitted" aria-hidden>
          … {omitted} 行已省略 …
        </div>
      ) : null}
      <pre
        className={`file-editor-streaming-pre file-editor-streaming-pre--${lang}`}
      >
        {tail}
      </pre>
    </>
  );
}

export const StreamingCodeTailPreview = memo(
  StreamingCodeTailPreviewInner,
  (prev, next) =>
    prev.path === next.path
    && prev.maxLines === next.maxLines
    && prev.content === next.content,
);
