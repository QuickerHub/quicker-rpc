"use client";

import { useRef, type ReactNode } from "react";

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
  /** Retain reading state for lightweight content while the fold is closed. */
  keepMounted?: boolean;
  /** A single call shares the batch owner without displaying a batch heading. */
  summaryHidden?: boolean;
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
  keepMounted = false,
  summaryHidden = false,
}: ToolDisclosureProps) {
  const isOpen = forcedOpen ?? open;
  const canToggle = forcedOpen === null && onOpenChange;
  const visited = useRef(isOpen);
  if (isOpen) visited.current = true;

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
        hidden={summaryHidden}
        style={summaryHidden ? { display: "none" } : undefined}
        aria-expanded={isOpen}
        disabled={!canToggle}
        onClick={() => {
          if (!canToggle) return;
          onOpenChange(!open);
        }}
      >
        {summary}
      </button>
      {keepMounted && visited.current ? <div hidden={!isOpen}>{children}</div> : isOpen ? children : null}
    </div>
  );
}
