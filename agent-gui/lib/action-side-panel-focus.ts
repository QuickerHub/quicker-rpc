import type { ActionExplorerTree } from "@/lib/action-explorer-tree";
import { useMemo } from "react";
import { resolveActionIdFromProject } from "@/lib/action-project-id";
import {
  useOptionalWorkspaceExplorerEditor,
  useWorkspaceExplorerShell,
} from "@/lib/workspace-explorer";
import { isSidePanelEditorView } from "@/lib/workspace-side-panel-view";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Action tree snapshot for path→actionId without subscribing chat to tree updates. */
export const actionExplorerTreeRef: { current: ActionExplorerTree | null } = {
  current: null,
};

/** Workspace-relative `.quicker/actions/{dir}` root for any file under an action project. */
export function actionProjectRootFromWorkspacePath(path: string): string | undefined {
  const normalized = path.replace(/\\/g, "/");
  const match = normalized.match(/(^|\/)(\.quicker\/actions\/[^/]+)/i);
  return match?.[2];
}

function treeActionIdForProjectRoot(projectRoot: string): string | undefined {
  const tree = actionExplorerTreeRef.current;
  if (!tree) return undefined;
  const normalizedRoot = projectRoot.replace(/\\/g, "/");
  for (const node of tree.children) {
    const nodePath = node.path.replace(/\\/g, "/");
    if (nodePath === normalizedRoot) {
      return node.actionId?.trim().toLowerCase();
    }
  }
  return undefined;
}

/** Resolve Quicker action GUID from a workspace file path under `.quicker/actions/`. */
export function resolveFocusedActionIdFromEditorPath(
  path: string | undefined,
): string | undefined {
  if (!path) return undefined;
  const projectRoot = actionProjectRootFromWorkspacePath(path);
  if (!projectRoot) return undefined;

  const dirName = projectRoot.split("/").pop()?.trim();
  if (!dirName) return undefined;

  if (UUID_RE.test(dirName)) return dirName.toLowerCase();

  const fromTree = treeActionIdForProjectRoot(projectRoot);
  if (fromTree && UUID_RE.test(fromTree)) return fromTree;

  return resolveActionIdFromProject(dirName)?.toLowerCase();
}

/** True when the right workspace editor is showing this action's project. */
export function useIsActionFocusedInSidePanel(actionId: string): boolean {
  const { panelOpen, activeSideView } = useWorkspaceExplorerShell();
  const editor = useOptionalWorkspaceExplorerEditor();
  const normalizedId = actionId.trim().toLowerCase();

  return useMemo(() => {
    if (!panelOpen || !normalizedId) return false;
    if (!isSidePanelEditorView(activeSideView)) return false;
    const focusedId = resolveFocusedActionIdFromEditorPath(editor?.activeTab?.path);
    return focusedId === normalizedId;
  }, [
    panelOpen,
    activeSideView,
    editor?.activeTab?.path,
    normalizedId,
  ]);
}
