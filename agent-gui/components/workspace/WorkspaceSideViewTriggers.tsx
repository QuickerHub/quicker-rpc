"use client";

import {
  SidePanelIconBrowser,
  SidePanelIconExplorer,
  SidePanelIconTrace,
} from "@/components/workspace/side-panel-view-icons";
import { useSidePanelBrowserToggle } from "@/lib/use-side-panel-browser-toggle";
import { useSidePanelExplorerToggle } from "@/lib/use-side-panel-explorer-toggle";
import { useSidePanelTraceToggle } from "@/lib/use-side-panel-trace-toggle";

/** Icon toggles for workspace side views (Cursor-style activity buttons). */
export function WorkspaceSideViewTriggers() {
  const explorer = useSidePanelExplorerToggle();
  const browser = useSidePanelBrowserToggle();
  const trace = useSidePanelTraceToggle();

  return (
    <div
      className="side-view-triggers"
      role="toolbar"
      aria-label="工作区视图"
    >
      <button
        type="button"
        className={`side-view-trigger-btn${explorer.active ? " side-view-trigger-btn--active" : ""}`}
        onClick={explorer.toggle}
        aria-pressed={explorer.active}
        aria-label="资源管理器"
        title="资源管理器"
      >
        <SidePanelIconExplorer />
      </button>
      <button
        type="button"
        className={`side-view-trigger-btn${browser.active ? " side-view-trigger-btn--active" : ""}`}
        onClick={browser.toggle}
        aria-pressed={browser.active}
        aria-label="浏览器"
        title="浏览器"
      >
        <SidePanelIconBrowser />
      </button>
      <button
        type="button"
        className={`side-view-trigger-btn${trace.active ? " side-view-trigger-btn--active" : ""}`}
        onClick={trace.toggle}
        aria-pressed={trace.active}
        aria-label="调试"
        title="调试"
      >
        <SidePanelIconTrace />
      </button>
    </div>
  );
}
