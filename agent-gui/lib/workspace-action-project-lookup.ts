import type { ActionExplorerTree } from "./action-explorer-tree";
import {
  isGlobalSubProgramRootNode,
  resolveActionProjectId,
} from "./action-explorer-tree";

export type WorkspaceDeleteProjectHit = {
  kind: "action" | "subprogram";
  id: string;
  projectPath: string;
  title?: string;
};

export function normalizeActionId(id: string): string {
  return id.trim().toLowerCase();
}

function collectLookupKeys(raw: Iterable<string>): Set<string> {
  const wanted = new Set<string>();
  for (const value of raw) {
    const normalized = normalizeActionId(value);
    if (normalized) wanted.add(normalized);
  }
  return wanted;
}

function nodeMatchesLookupKeys(
  nodeKeys: Iterable<string | undefined>,
  wanted: Set<string>,
): boolean {
  for (const raw of nodeKeys) {
    const normalized = normalizeActionId(raw ?? "");
    if (normalized && wanted.has(normalized)) return true;
  }
  return false;
}

/** Match pending delete ids against top-level .quicker/actions project rows. */
export function findWorkspaceProjectsInTree(
  tree: ActionExplorerTree | null | undefined,
  actionIds: Iterable<string>,
): WorkspaceDeleteProjectHit[] {
  if (!tree?.children?.length) return [];

  const wanted = collectLookupKeys(actionIds);
  if (wanted.size === 0) return [];

  const hits: WorkspaceDeleteProjectHit[] = [];
  for (const node of tree.children) {
    const actionId = resolveActionProjectId(node);
    if (!actionId) continue;
    if (!wanted.has(normalizeActionId(actionId))) continue;
    hits.push({
      kind: "action",
      id: actionId,
      projectPath: node.path.replace(/\\/g, "/"),
      title: node.title?.trim() || undefined,
    });
  }

  hits.sort((a, b) =>
    (a.title ?? a.id).localeCompare(b.title ?? b.id, undefined, {
      sensitivity: "base",
    }),
  );
  return hits;
}

/** Match pending delete ids/names against top-level .quicker/subprograms project rows. */
export function findWorkspaceSubProgramsInTree(
  tree: ActionExplorerTree | null | undefined,
  subProgramKeys: Iterable<string>,
): WorkspaceDeleteProjectHit[] {
  if (!tree?.children?.length) return [];

  const wanted = collectLookupKeys(subProgramKeys);
  if (wanted.size === 0) return [];

  const hits: WorkspaceDeleteProjectHit[] = [];
  for (const node of tree.children) {
    if (!isGlobalSubProgramRootNode(node)) continue;
    if (
      !nodeMatchesLookupKeys(
        [node.subProgramId, node.actionId, node.name, node.title],
        wanted,
      )
    ) {
      continue;
    }
    const id = (node.subProgramId ?? node.name).trim();
    if (!id) continue;
    hits.push({
      kind: "subprogram",
      id,
      projectPath: node.path.replace(/\\/g, "/"),
      title: node.title?.trim() || undefined,
    });
  }

  hits.sort((a, b) =>
    (a.title ?? a.id).localeCompare(b.title ?? b.id, undefined, {
      sensitivity: "base",
    }),
  );
  return hits;
}
