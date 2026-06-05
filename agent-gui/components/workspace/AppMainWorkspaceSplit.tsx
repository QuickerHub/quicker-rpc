"use client";

import { memo, type ReactNode } from "react";

import { useDocsViewer } from "@/lib/docs-viewer";
import {
  useWorkspaceExplorerEditor,
  useWorkspaceExplorerTree,
} from "@/lib/workspace-explorer";
import { WorkspaceMainEditorPanel } from "@/components/workspace/WorkspaceMainEditorPanel";

type AppMainWorkspaceSplitProps = {
  children: ReactNode;
};

/** Chat column + optional full-width file/doc editor; explorer sidebar is tree-only. */
export const AppMainWorkspaceSplit = memo(function AppMainWorkspaceSplit({
  children,
}: AppMainWorkspaceSplitProps) {
  const { activeDoc } = useDocsViewer();
  const { tabs } = useWorkspaceExplorerEditor();
  const { refreshTree } = useWorkspaceExplorerTree();
  const showEditorPane = tabs.length > 0 || activeDoc != null;

  return (
    <div
      className={`app-main-split${showEditorPane ? " app-main-split--editor-open" : ""}`}
    >
      <div className="app-main-chat-pane">
        <div className="app-main-stack">{children}</div>
      </div>
      {showEditorPane ? (
        <div className="app-main-editor-pane" aria-label="工作区编辑器">
          <WorkspaceMainEditorPanel
            onRefreshTree={() => {
              void refreshTree();
            }}
          />
        </div>
      ) : null}
    </div>
  );
});
