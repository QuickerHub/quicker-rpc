import type { ResolvedActionDataJson } from "@/lib/action-project-data-file.server";
import { resolveActionDataJsonPath } from "@/lib/action-project-data-file.server";
import {
  enrichActionProjectResolveError,
  getPrimaryActionId,
  guardWorkspaceActionId,
  type ActionScopeHint,
} from "@/lib/action-scope";
import { syncActionToWorkspace } from "@/lib/action-project-workflow";
import { getRequestActionScope } from "@/lib/qkrpc-request-context";

export type WorkspaceActionResolveResult =
  | {
      ok: true;
      resolved: ResolvedActionDataJson;
      /** qkrpc_action_get extract ran because disk was missing but id matched scope. */
      autoSynced?: boolean;
    }
  | { ok: false; error: string };

/**
 * Resolve data.json for workspace_action_* tools: scope guard, optional auto-sync.
 */
export async function resolveWorkspaceActionForTool(
  requestedId: string,
): Promise<WorkspaceActionResolveResult> {
  const scope = getRequestActionScope();
  const guard = guardWorkspaceActionId(requestedId, scope);
  if (!guard.ok) {
    return { ok: false, error: guard.error };
  }

  const id = guard.id;
  let resolved = await resolveActionDataJsonPath(id);
  if (resolved.ok) {
    return { ok: true, resolved: resolved.resolved };
  }

  const primary = getPrimaryActionId(scope);
  const mayAutoSync =
    primary !== undefined && primary.toLowerCase() === id.toLowerCase();

  if (mayAutoSync) {
    const sync = await syncActionToWorkspace(id);
    if (sync.ok) {
      resolved = await resolveActionDataJsonPath(id);
      if (resolved.ok) {
        return {
          ok: true,
          resolved: resolved.resolved,
          autoSynced: true,
        };
      }
    }
  }

  return {
    ok: false,
    error: enrichActionProjectResolveError(
      resolved.error,
      scope,
      id,
    ),
  };
}

export function formatAutoSyncedNote(autoSynced?: boolean): string | undefined {
  if (!autoSynced) return undefined;
  return "Auto-synced from Quicker via qkrpc_action_get (extract) because the id matched the conversation action scope.";
}
