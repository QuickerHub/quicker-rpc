"use client";

import { ExplorerPanelToggle } from "@/components/workspace/WorkspaceExplorerPanel";

/** Panel fold toggle — trailing control in the right split header. */
export function WorkspaceSidePanelHeaderControls({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={`workspace-side-panel-head-trailing${className ? ` ${className}` : ""}`}
    >
      <ExplorerPanelToggle className="side-view-trigger-btn" />
    </div>
  );
}
