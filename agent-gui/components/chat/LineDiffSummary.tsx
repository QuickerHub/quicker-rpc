"use client";

/** Colored +N -M line diff badge (tool batch headers, file editor chips). */
export function LineDiffSummary({
  addLines,
  removeLines,
  className = "",
}: {
  addLines: number;
  removeLines: number;
  className?: string;
}) {
  if (addLines === 0 && removeLines === 0) return null;

  return (
    <span
      className={["tool-line-diff-summary", className].filter(Boolean).join(" ")}
      aria-label={`+${addLines} -${removeLines}`}
    >
      {addLines > 0 ? (
        <span className="tool-line-diff-summary__add">+{addLines}</span>
      ) : null}
      {removeLines > 0 ? (
        <span className="tool-line-diff-summary__remove">-{removeLines}</span>
      ) : null}
    </span>
  );
}
