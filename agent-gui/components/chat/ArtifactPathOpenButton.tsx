"use client";

import { useWorkspaceExplorerActions } from "@/lib/workspace-explorer";

type ArtifactPathOpenButtonProps = {
  path: string;
  label?: string;
};

/** Open a workspace-relative artifact path in the side file panel. */
export function ArtifactPathOpenButton({
  path,
  label = "在工作区打开",
}: ArtifactPathOpenButtonProps) {
  const { openFile, revealPath, setPanelOpen } = useWorkspaceExplorerActions();

  return (
    <button
      type="button"
      className="artifact-path-open-btn"
      onClick={() => {
        revealPath(path);
        openFile(path, undefined, { revealInTree: true });
        setPanelOpen(true);
      }}
    >
      {label}
    </button>
  );
}
