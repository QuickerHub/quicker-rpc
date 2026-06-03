import { existsSync } from "node:fs";
import {
  actionProjectDirFromName,
  findActionProjectDirectory,
} from "@/lib/action-project-path";
import { resolveWorkspacePath } from "@/lib/workspace-fs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResolvedActionDataJson = {
  actionId: string;
  projectDir: string;
  path: string;
};

export async function resolveActionDataJsonPath(
  actionId: string,
): Promise<{ ok: true; resolved: ResolvedActionDataJson } | { ok: false; error: string }> {
  const id = actionId.trim();
  if (!UUID_RE.test(id)) {
    return { ok: false, error: "id must be a Quicker action GUID" };
  }

  const byGuidDir = actionProjectDirFromName(id);
  const dataPath = `${byGuidDir}/data.json`;
  const direct = resolveWorkspacePath(dataPath);
  if (direct.ok && existsSync(direct.absolute)) {
    return {
      ok: true,
      resolved: { actionId: id, projectDir: byGuidDir, path: dataPath },
    };
  }

  const projectDir = await findActionProjectDirectory(id);
  if (!projectDir) {
    return {
      ok: false,
      error:
        `No local project for action ${id}. Run qkrpc_action_get({ id }) to sync .quicker/actions first.`,
    };
  }

  return {
    ok: true,
    resolved: {
      actionId: id,
      projectDir,
      path: `${projectDir}/data.json`,
    },
  };
}
