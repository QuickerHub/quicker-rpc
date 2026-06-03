"use client";

export function ToolSummaryTitle({
  displayName,
  meta,
  isRunning,
  state,
  showChevron,
  isError,
}: {
  displayName: string;
  meta: string;
  isRunning: boolean;
  state: string;
  showChevron?: boolean;
  /** Structured qkrpc failure while state is still output-available. */
  isError?: boolean;
}) {
  const err = isError ?? state === "output-error";
  return (
    <span className="tool-title">
      <span className="tool-name">{displayName}</span>
      <span
        className={`tool-meta${isRunning ? " tool-meta--running" : ""}${err ? " tool-meta--err" : ""}${state === "approval-requested" ? " tool-meta--approval" : ""}`}
      >
        {meta}
      </span>
      {showChevron !== false && <span className="tool-chevron" aria-hidden />}
    </span>
  );
}
