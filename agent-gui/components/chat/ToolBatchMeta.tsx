"use client";

import { LineDiffSummary } from "./LineDiffSummary";

/** Tool batch summary meta with optional colored line-diff prefix. */
export function ToolBatchMeta({
  meta,
  lineDiff,
  running = false,
  error = false,
  approval = false,
}: {
  meta: string;
  lineDiff?: { addLines: number; removeLines: number } | null;
  running?: boolean;
  error?: boolean;
  approval?: boolean;
}) {
  const showDiff = lineDiff && (lineDiff.addLines > 0 || lineDiff.removeLines > 0);

  return (
    <span
      className={[
        "tool-meta",
        running ? "tool-meta--running" : "",
        error ? "tool-meta--err" : "",
        approval ? "tool-meta--approval" : "",
        showDiff ? "tool-meta--with-diff" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {showDiff ? (
        <>
          <LineDiffSummary
            addLines={lineDiff.addLines}
            removeLines={lineDiff.removeLines}
          />
          <span className="tool-meta__sep" aria-hidden>
            {" "}
            ·{" "}
          </span>
        </>
      ) : null}
      {meta}
    </span>
  );
}
