"use client";

import { WorkspaceEmbeddedBrowser } from "@/components/browser/WorkspaceEmbeddedBrowser";
import { useSidePanelBrowserToggle } from "@/lib/use-side-panel-browser-toggle";

/** @deprecated Use WorkspaceEmbeddedBrowser in the side panel. */
export function EmbeddedBrowserContent() {
  return <WorkspaceEmbeddedBrowser />;
}

/** @deprecated Browser now lives in the right workspace side panel. */
export function EmbeddedBrowserPanel() {
  return null;
}

export function BrowserPanelToggle({
  className,
}: {
  className?: string;
}) {
  const { toggle, active } = useSidePanelBrowserToggle();
  return (
    <button
      type="button"
      className={className}
      aria-pressed={active}
      title={active ? "隐藏内嵌浏览器" : "显示内嵌浏览器"}
      onClick={toggle}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <rect x="1.5" y="2.5" width="11" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.15" />
        <path d="M1.5 5h11" stroke="currentColor" strokeWidth="1.15" />
        <circle cx="3.25" cy="3.75" r="0.55" fill="currentColor" />
        <circle cx="4.75" cy="3.75" r="0.55" fill="currentColor" />
      </svg>
    </button>
  );
}
