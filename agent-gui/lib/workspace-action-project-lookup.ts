import type { ActionExplorerTree } from "./action-explorer-tree";
import { resolveActionProjectId } from "./action-explorer-tree";

export type WorkspaceActionProjectHit = {
  actionId: string;
  projectPath: string;
  title?: string;
};

export function normalizeActionId(id: string): string {
  return id.trim().toLowerCase();
}

/** Match pending delete ids against top-level .quicker/actions project rows. */
export function findWorkspaceProjectsInTree(
  tree: ActionExplorerTree | null | undefined,
  actionIds: Iterable<string>,
): WorkspaceActionProjectHit[] {
  if (!tree?.children?.length) return [];

  const wanted = new Set<string>();
  for (const raw of actionIds) {
    const normalized = normalizeActionId(raw);
    if (normalized) wanted.add(normalized);
  }
  if (wanted.size === 0) return [];

  const hits: WorkspaceActionProjectHit[] = [];
  for (const node of tree.children) {
    const actionId = resolveActionProjectId(node);
    if (!actionId) continue;
    if (!wanted.has(normalizeActionId(actionId))) continue;
    hits.push({
      actionId,
      projectPath: node.path.replace(/\\/g, "/"),
      title: node.title?.trim() || undefined,
    });
  }

  hits.sort((a, b) =>
    (a.title ?? a.actionId).localeCompare(b.title ?? b.actionId, undefined, {
      sensitivity: "base",
    }),
  );
  return hits;
}

export function workspaceDeleteCheckboxLabel(hitCount: number): string {
  if (hitCount <= 0) return "";
  if (hitCount === 1) {
    return "同时删除工作区中的动作项目（.quicker/actions）";
  }
  return `同时删除工作区中的 ${hitCount} 个动作项目（.quicker/actions）`;
}
