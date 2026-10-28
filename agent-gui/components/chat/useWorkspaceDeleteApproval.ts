"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { extractApprovalTargetId, type PendingToolApproval } from "@/lib/tool-approval-display";
import {
  findWorkspaceProjectsInTree,
  findWorkspaceSubProgramsInTree,
  type WorkspaceDeleteProjectHit,
} from "@/lib/workspace-action-project-lookup";
import { fetchActionExplorerTree } from "@/lib/workspace-explorer-api";

// Include every approval, even ones without a local delete, so a batch cannot
// inherit another batch's lookup or checkbox selection.
function approvalTargetsKey(approvals: PendingToolApproval[]): string {
  return JSON.stringify(approvals.map(approval => [
    approval.id, approval.toolName, extractApprovalTargetId(approval.input),
  ]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

type WorkspaceDeleteSnapshot = {
  id: string;
  context: object;
  targetsKey: string;
  cwd: string;
  hits: WorkspaceDeleteProjectHit[];
};

export function useWorkspaceDeleteApproval(
  threadId: string,
  workingDirectory: string,
  approvals: PendingToolApproval[],
) {
  const cwd = workingDirectory.trim();
  const targetsKey = approvalTargetsKey(approvals);
  const context = useMemo(() => ({ threadId, cwd, targetsKey }), [threadId, cwd, targetsKey]);
  const [resolved, setResolved] = useState<WorkspaceDeleteSnapshot | null>(null);
  // Invalidate during render, before the old effect's cleanup or a new lookup.
  const snapshot = resolved?.context === context ? resolved : null;
  const current = useRef<WorkspaceDeleteSnapshot | null>(null);
  useLayoutEffect(() => {
    current.current = snapshot;
    return () => { current.current = null; };
  }, [snapshot]);

  useEffect(() => {
    const targets = JSON.parse(targetsKey) as [string, string, string | null][];
    const actionIds = targets.filter(([, tool, id]) => tool === "qkrpc_action_delete" && id).map(([, , id]) => id!);
    const subprogramIds = targets.filter(([, tool, id]) => tool === "qkrpc_subprogram_delete" && id).map(([, , id]) => id!);
    if (!cwd || (actionIds.length === 0 && subprogramIds.length === 0)) return;
    let cancelled = false;
    void fetchActionExplorerTree(cwd).then(result => {
      if (cancelled || !result.ok) return;
      setResolved({
        id: crypto.randomUUID(), context, targetsKey, cwd,
        hits: [
          ...findWorkspaceProjectsInTree(result.tree, actionIds),
          ...findWorkspaceSubProgramsInTree(result.subprogramTree, subprogramIds),
        ],
      });
    }).catch(() => {
      // A failed lookup grants no local deletion; ordinary approval still works.
    });
    return () => { cancelled = true; };
  }, [context, cwd, targetsKey]);

  const getSnapshot = useCallback((id: string | undefined) => {
    const value = current.current;
    return id && value?.id === id && value.hits.length > 0 ? value : null;
  }, []);
  return { snapshot, getSnapshot };
}

export function workspaceDeleteMatchesApprovals(
  snapshot: WorkspaceDeleteSnapshot,
  approvals: PendingToolApproval[],
): boolean {
  return snapshot.targetsKey === approvalTargetsKey(approvals);
}
