"use client";

import {
  SidePanelIconBrowser,
  SidePanelIconExplorer,
  SidePanelIconTerminal,
} from "@/components/workspace/side-panel-view-icons";
import { useSidePanelBrowserToggle } from "@/lib/use-side-panel-browser-toggle";
import { useSidePanelExplorerToggle } from "@/lib/use-side-panel-explorer-toggle";
import { useSidePanelTerminalToggle } from "@/lib/use-side-panel-terminal-toggle";

/** Icon toggles for workspace side views (Cursor-style activity buttons). */
export function WorkspaceSideViewTriggers() {
  const explorer = useSidePanelExplorerToggle();
  const browser = useSidePanelBrowserToggle();
  const terminal = useSidePanelTerminalToggle();

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
        className={`side-view-trigger-btn${terminal.active ? " side-view-trigger-btn--active" : ""}`}
        onClick={terminal.toggle}
        aria-pressed={terminal.active}
        aria-label="终端"
        title="终端"
      >
        <SidePanelIconTerminal />
      </button>
    </div>
  );
}
