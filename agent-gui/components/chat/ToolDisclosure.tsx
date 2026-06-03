"use client";

import type { ReactNode } from "react";

type ToolDisclosureProps = {
  className?: string;
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  /** When non-null, overrides `open` and disables user toggle. */
  forcedOpen?: boolean | null;
  summaryClassName?: string;
  expandedClassName?: string;
  collapsedClassName?: string;
  summary: ReactNode;
  children: ReactNode;
};

/** Tool expand/collapse without native `<details>` (avoids controlled toggle loops). */
export function ToolDisclosure({
  className = "",
  open,
  onOpenChange,
  forcedOpen = null,
  summaryClassName = "tool-summary",
  expandedClassName = "tool-card--expanded",
  collapsedClassName = "tool-card--collapsed",
  summary,
  children,
}: ToolDisclosureProps) {
  const isOpen = forcedOpen ?? open;
  const canToggle = forcedOpen === null && onOpenChange;

  return (
    <div
      className={[
        className,
        isOpen ? expandedClassName : collapsedClassName,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className={summaryClassName}
        aria-expanded={isOpen}
        disabled={!canToggle}
        onClick={() => {
          if (!canToggle) return;
          onOpenChange(!open);
        }}
      >
        {summary}
      </button>
      {isOpen ? children : null}
    </div>
  );
}
