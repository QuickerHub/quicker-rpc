import { existsSync } from "node:fs";
import { actionProjectDirFromName, findActionProjectDirectory } from "@/lib/action-project-path";
import { enrichActionProjectResolveError, guardWorkspaceActionId } from "@/lib/action-scope";
import { syncActionToWorkspace } from "@/lib/action-project-workflow";
import { getRequestActionScope } from "@/lib/qkrpc-request-context";
import { resolveWorkspacePath } from "@/lib/workspace-fs";

/** Project-relative path for inputParams.*.file (must be under files/). */
export function validateActionProjectResourceRelativePath(
  inputPath: string,
):
  | { ok: true; normalized: string }
  | { ok: false; error: string } {
  const trimmed = inputPath.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!trimmed) {
    return { ok: false, error: "path is required." };
  }

  const lower = trimmed.toLowerCase();
  if (lower.startsWith(".quicker/")) {
    return { ok: false, error: "path must be project-relative (e.g. files/main.cs)." };
  }

  if (lower === "data.json" || lower === "info.json") {
    return { ok: false, error: "use workspace_action_*_data for data.json." };
  }

  if (lower === "files" || lower === "files/") {
    return { ok: false, error: "path must be a file under files/ (e.g. files/main.cs)." };
  }

  if (!lower.startsWith("files/")) {
    return { ok: false, error: "path must start with files/." };
  }

  const segments = trimmed.split("/").filter(Boolean);
  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      return { ok: false, error: "path must not contain . or .. segments." };
    }
  }

  const fileName = segments[segments.length - 1];
  if (!fileName || fileName === "files") {
    return { ok: false, error: "path must include a file name under files/." };
  }

  return { ok: true, normalized: segments.join("/") };
}

export type ResolvedActionProjectFile = {
  actionId: string;
  projectDir: string;
  /** Path relative to workspace cwd (e.g. .quicker/actions/{id}/files/foo.cs). */
  path: string;
  /** Path relative to action project root (e.g. files/foo.cs). */
  resourcePath: string;
  autoSynced?: boolean;
};

export async function resolveActionProjectFileForTool(
  requestedId: string,
  relativePath: string,
): Promise<
  | { ok: true; resolved: ResolvedActionProjectFile }
  | { ok: false; error: string }
> {
  const validated = validateActionProjectResourceRelativePath(relativePath);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const scope = getRequestActionScope();
  const guard = guardWorkspaceActionId(requestedId, scope);
  if (!guard.ok) {
    return { ok: false, error: guard.error };
  }

  const actionId = guard.id;
  let projectDir = await findActionProjectDirectory(actionId);
  let autoSynced = false;

  if (!projectDir) {
    const byGuidDir = actionProjectDirFromName(actionId);
    const infoResolved = resolveWorkspacePath(`${byGuidDir}/info.json`);
    if (infoResolved.ok && existsSync(infoResolved.absolute)) {
      projectDir = byGuidDir;
    }
  }

  if (!projectDir) {
    const sync = await syncActionToWorkspace(actionId);
    if (sync.ok) {
      projectDir = sync.manifest.projectDirectory;
      autoSynced = true;
    }
  }

  if (!projectDir) {
    return {
      ok: false,
      error: enrichActionProjectResolveError(
        `No .quicker/actions project for action ${actionId}. Run qkrpc_action_get({ id }) or qkrpc_action_create first.`,
        scope,
        actionId,
      ),
    };
  }

  const workspaceRelative = `${projectDir}/${validated.normalized}`;
  const resolved = resolveWorkspacePath(workspaceRelative);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }

  return {
    ok: true,
    resolved: {
      actionId,
      projectDir,
      path: resolved.relative,
      resourcePath: validated.normalized,
      autoSynced: autoSynced || undefined,
    },
  };
}

/** Compact success payload for workspace_action_file_* (path is canonical). */
export function actionProjectFileToolSuccess(
  action: "file-read" | "file-write" | "file-edit",
  resolved: ResolvedActionProjectFile,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    action,
    success: true,
    path: resolved.path,
    ...body,
  };
  if (resolved.autoSynced) {
    payload.synced = true;
  }
  return payload;
}
