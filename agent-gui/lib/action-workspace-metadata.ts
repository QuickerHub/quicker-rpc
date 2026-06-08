import type { ActionMetadataSnapshot } from "@/lib/action-metadata-api";
import { parseActionMetadataFromInfoJson } from "@/lib/action-metadata-api";
import { actionProjectDirFromName } from "@/lib/action-project-path-shared";
import type { ActionExplorerTree, ExplorerTreeNode } from "@/lib/action-explorer-tree";
import { resolveActionProjectIconSpec } from "@/lib/action-project-icon";
import { resolveActionProjectId } from "@/lib/action-explorer-tree";
import { resolveActionWorkspaceProject } from "@/lib/resolve-action-workspace-project";
import { fetchWorkspaceFile } from "@/lib/workspace-explorer-api";
import { normalizeActionId } from "@/lib/workspace-action-project-lookup";

export function actionMetadataFromExplorerNode(
  actionId: string,
  node: ExplorerTreeNode,
): ActionMetadataSnapshot | null {
  const resolvedId = resolveActionProjectId(node);
  if (!resolvedId) return null;
  if (normalizeActionId(resolvedId) !== normalizeActionId(actionId)) return null;

  const id = normalizeActionId(resolvedId);
  const title = node.title?.trim() || "(无标题)";
  const description = node.description?.trim() || undefined;
  const icon = resolveActionProjectIconSpec(node.icon);

  return { id, title, description, icon };
}

export function findActionMetadataInExplorerTree(
  tree: ActionExplorerTree | null | undefined,
  actionId: string,
): ActionMetadataSnapshot | null {
  if (!tree?.children?.length) return null;
  const wanted = normalizeActionId(actionId);
  if (!wanted) return null;

  for (const node of tree.children) {
    const meta = actionMetadataFromExplorerNode(wanted, node);
    if (meta) return meta;
  }
  return null;
}

/** Read action metadata from workspace info.json (preferred over Quicker metadata get). */
export async function fetchWorkspaceActionMetadata(
  cwd: string,
  actionId: string,
): Promise<ActionMetadataSnapshot | null> {
  const trimmedCwd = cwd.trim();
  const trimmedId = actionId.trim().toLowerCase();
  if (!trimmedCwd || !trimmedId) return null;

  const project = await resolveActionWorkspaceProject(trimmedCwd, trimmedId);
  const infoPath = project
    ? `${project.projectPath}/info.json`
    : `${actionProjectDirFromName(trimmedId)}/info.json`;

  const file = await fetchWorkspaceFile(trimmedCwd, infoPath);
  if (!file.ok) return null;

  return parseActionMetadataFromInfoJson(trimmedId, file.content);
}
