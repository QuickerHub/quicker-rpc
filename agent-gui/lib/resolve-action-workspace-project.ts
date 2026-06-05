import { actionProjectDirFromName } from "@/lib/action-project-path-shared";
import { fetchActionExplorerTree, fetchWorkspaceFile } from "@/lib/workspace-explorer-api";
import { findWorkspaceProjectsInTree } from "@/lib/workspace-action-project-lookup";

export type ResolvedActionWorkspaceProject = {
  projectPath: string;
  title?: string;
};

/** Find `.quicker/actions` project for an action id under the workspace cwd. */
export async function resolveActionWorkspaceProject(
  cwd: string,
  actionId: string,
): Promise<ResolvedActionWorkspaceProject | null> {
  const trimmedCwd = cwd.trim();
  const trimmedId = actionId.trim();
  if (!trimmedCwd || !trimmedId) return null;

  const treeResult = await fetchActionExplorerTree(trimmedCwd, { depth: "roots" });
  if (treeResult.ok) {
    const hits = findWorkspaceProjectsInTree(treeResult.tree, [trimmedId]);
    const hit = hits[0];
    if (hit) {
      return { projectPath: hit.projectPath, title: hit.title };
    }
  }

  const fallbackPath = actionProjectDirFromName(trimmedId);
  const info = await fetchWorkspaceFile(
    trimmedCwd,
    `${fallbackPath}/info.json`,
  );
  if (info.ok) {
    return { projectPath: fallbackPath };
  }

  return null;
}
