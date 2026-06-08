"use client";

import type { ReactNode } from "react";

export function ToolSummaryTitle({
  displayName,
  meta,
  metaContent,
  isRunning,
  state,
  showChevron,
  isError,
}: {
  displayName: string;
  meta?: string;
  /** Rich meta (e.g. colored line-diff); rendered inside tool-meta. */
  metaContent?: ReactNode;
  isRunning: boolean;
  state: string;
  showChevron?: boolean;
  /** Structured qkrpc failure while state is still output-available. */
  isError?: boolean;
}) {
  const err = isError ?? state === "output-error";
  const metaClass = [
    "tool-meta",
    isRunning ? "tool-meta--running" : "",
    err ? "tool-meta--err" : "",
    state === "approval-requested" ? "tool-meta--approval" : "",
    metaContent ? "tool-meta--with-diff" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className="tool-title">
      <span className="tool-name">{displayName}</span>
      <span className={metaClass}>
        {metaContent ?? meta ?? ""}
      </span>
      {showChevron !== false && <span className="tool-chevron" aria-hidden />}
    </span>
  );
}
