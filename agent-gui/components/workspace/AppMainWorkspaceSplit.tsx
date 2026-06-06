"use client";

import { memo, type ReactNode } from "react";

import { EmbeddedBrowserPanel } from "@/components/browser/EmbeddedBrowserPanel";
import { useDocsViewer } from "@/lib/docs-viewer";
import { useEmbeddedBrowser } from "@/lib/embedded-browser-context";
import {
  useWorkspaceExplorerEditor,
  useWorkspaceExplorerTree,
} from "@/lib/workspace-explorer";
import { WorkspaceMainEditorPanel } from "@/components/workspace/WorkspaceMainEditorPanel";

type AppMainWorkspaceSplitProps = {
  children: ReactNode;
};

/** Chat column + optional file/doc editor + embedded browser panel. */
export const AppMainWorkspaceSplit = memo(function AppMainWorkspaceSplit({
  children,
}: AppMainWorkspaceSplitProps) {
  const { activeDoc } = useDocsViewer();
  const { tabs } = useWorkspaceExplorerEditor();
  const { refreshTree } = useWorkspaceExplorerTree();
  const { open: browserOpen } = useEmbeddedBrowser();
  const showEditorPane = tabs.length > 0 || activeDoc != null;
  const splitClass = [
    "app-main-split",
    showEditorPane ? "app-main-split--editor-open" : "",
    browserOpen ? "app-main-split--browser-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={splitClass}>
      <div className="app-main-chat-pane">
        <div className="app-main-stack">{children}</div>
      </div>
      {browserOpen ? <EmbeddedBrowserPanel /> : null}
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
