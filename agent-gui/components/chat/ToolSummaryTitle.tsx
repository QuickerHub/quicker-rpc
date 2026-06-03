"use client";

export function ToolSummaryTitle({
  displayName,
  meta,
  isRunning,
  state,
  showChevron,
}: {
  displayName: string;
  meta: string;
  isRunning: boolean;
  state: string;
  showChevron?: boolean;
}) {
  return (
    <span className="tool-title">
      <span className="tool-name">{displayName}</span>
      <span
        className={`tool-meta${isRunning ? " tool-meta--running" : ""}${state === "output-error" ? " tool-meta--err" : ""}${state === "approval-requested" ? " tool-meta--approval" : ""}`}
      >
        {meta}
      </span>
      {showChevron !== false && <span className="tool-chevron" aria-hidden />}
    </span>
  );
}
