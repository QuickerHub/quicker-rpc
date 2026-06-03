import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseActionProjectInfo, stripJsonBom } from "@/lib/action-project-info-parse";
import { resolveWorkspacePath, resolveWorkspaceRoot } from "@/lib/workspace-fs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Relative path `.quicker/actions/{directoryName}`. */
export function actionProjectDirFromName(directoryName: string): string {
  const name = directoryName.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  return `.quicker/actions/${name.split("/").pop() ?? name}`;
}

/** Scan .quicker/actions subdirs; match action id in each info.json. */
export async function findActionProjectDirectory(
  actionId: string,
): Promise<string | null> {
  const id = actionId.trim();
  if (!UUID_RE.test(id)) return null;

  const actionsRoot = resolveWorkspacePath(".quicker/actions");
  if (!actionsRoot.ok) return null;

  let entries: string[];
  try {
    entries = await readdir(actionsRoot.absolute, { withFileTypes: true }).then(
      (items) => items.filter((e) => e.isDirectory()).map((e) => e.name),
    );
  } catch {
    return null;
  }

  for (const name of entries) {
    const projectDir = actionProjectDirFromName(name);
    const infoPath = resolveWorkspacePath(`${projectDir}/info.json`);
    if (!infoPath.ok) continue;

    try {
      const raw = stripJsonBom(await readFile(infoPath.absolute, "utf8"));
      const parsed = parseActionProjectInfo(raw);
      if (!parsed.ok || parsed.data.kind !== "action") continue;
      const found = (parsed.data.id ?? "").trim();
      if (found.toLowerCase() === id.toLowerCase()) {
        return projectDir;
      }
    } catch {
      /* skip invalid project */
    }
  }

  return null;
}

export async function resolveActionProjectDirectory(
  actionId: string,
): Promise<string | null> {
  return findActionProjectDirectory(actionId);
}

/** @deprecated Use findActionProjectDirectory — directory name is not the action id. */
export function defaultActionProjectDir(_actionId: string): string {
  void _actionId;
  return ".quicker/actions";
}

export function getActionsRootRelative(): string {
  return ".quicker/actions";
}

export function getWorkspaceRoot(): string {
  return resolveWorkspaceRoot();
}

export function joinActionProjectPath(directoryName: string): string {
  return join(getActionsRootRelative(), directoryName).replace(/\\/g, "/");
}
