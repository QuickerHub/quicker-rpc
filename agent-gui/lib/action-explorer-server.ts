import { existsSync } from "node:fs";
import { guardActionProjectBindingWrite } from "./action-project-host-binding.server";
import { SourceDocumentOwnerError, withExternalSourceDocumentWrite } from "./source-document-owner.server";
import { isActionSourceManagedPath } from "./qkrpc-action-source";
import { join } from "node:path";
import { readdir, readFile, rm } from "node:fs/promises";
import { basename } from "node:path";
import {
  actionProjectDirFromName,
  getActionsRootRelative,
} from "@/lib/action-project-path";
import {
  applyEmbeddedSubProgramMeta,
  buildExplorerTreeFromProjectMeta,
  type ActionEmbeddedSubProgramMeta,
  type ActionProjectMeta,
  type ActionExplorerTree,
} from "@/lib/action-explorer-tree";
import {
  actionProjectDisplayTitle,
  parseActionProjectInfo,
  stripJsonBom,
} from "@/lib/action-project-info-parse";
import {
  listWorkspaceFiles,
  readWorkspaceFileForExplorer,
  resolveWorkspacePath,
  writeWorkspaceFile,
} from "@/lib/workspace-fs";

/** Summaries for agent tool + explorer (scans each .quicker/actions project info.json). */
export async function listWorkspaceActionProjects(): Promise<{
  ok: true;
  root: string;
  projects: ActionProjectMeta[];
} | { ok: false; error: string }> {
  const root = getActionsRootRelative();
  const resolved = resolveWorkspacePath(root);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }
  const projects = await loadActionProjectMeta();
  return { ok: true, root, projects };
}

export async function loadActionProjectMeta(): Promise<ActionProjectMeta[]> {
  const root = getActionsRootRelative();
  const resolved = resolveWorkspacePath(root);
  if (!resolved.ok) return [];

  let dirNames: string[] = [];
  try {
    dirNames = await readdir(resolved.absolute, { withFileTypes: true }).then(
      (items) => items.filter((e) => e.isDirectory()).map((e) => e.name),
    );
  } catch {
    return [];
  }

  const meta: ActionProjectMeta[] = [];
  for (const dirName of dirNames) {
    const projectPath = actionProjectDirFromName(dirName);
    const infoPath = resolveWorkspacePath(`${projectPath}/info.json`);
    if (!infoPath.ok) continue;

    let title: string | undefined;
    let description: string | undefined;
    let icon: string | undefined;
    let actionId: string | undefined;
    try {
      const raw = stripJsonBom(await readFile(infoPath.absolute, "utf8"));
      const parsed = parseActionProjectInfo(raw);
      if (parsed.ok) {
        title = actionProjectDisplayTitle(parsed.data);
        description = parsed.data.description?.trim() || undefined;
        icon = parsed.data.icon?.trim() || undefined;
        actionId = parsed.data.id;
      }
    } catch {
      /* skip unreadable info.json */
    }

    meta.push({
      dirName,
      path: projectPath,
      title,
      description,
      icon,
      actionId:
        actionId
        ?? (/^[0-9a-f-]{36}$/i.test(dirName) ? dirName : undefined),
    });
  }

  return meta.sort((a, b) =>
    (a.title ?? a.dirName).localeCompare(b.title ?? b.dirName, undefined, {
      sensitivity: "base",
    }),
  );
}

async function readEmbeddedSubProgramMetaEntry(
  rootPath: string,
  actionDirName: string,
  subDirName: string,
  infoAbsolute: string,
): Promise<ActionEmbeddedSubProgramMeta> {
  const projectPath = `${rootPath}/${actionDirName}/subprograms/${subDirName}`.replace(
    /\\/g,
    "/",
  );

  let title: string | undefined;
  let subProgramId: string | undefined;
  try {
    const raw = stripJsonBom(await readFile(infoAbsolute, "utf8"));
    const parsed = parseActionProjectInfo(raw);
    if (parsed.ok) {
      title = actionProjectDisplayTitle(parsed.data);
      subProgramId = parsed.data.id;
    }
  } catch {
    /* skip unreadable info.json */
  }

  return {
    path: projectPath,
    dirName: subDirName,
    title,
    subProgramId:
      subProgramId
      ?? (/^[0-9a-f-]{36}$/i.test(subDirName) ? subDirName : undefined),
  };
}

async function loadEmbeddedSubProgramMeta(): Promise<ActionEmbeddedSubProgramMeta[]> {
  const rootPath = getActionsRootRelative();
  const resolved = resolveWorkspacePath(rootPath);
  if (!resolved.ok) return [];

  let actionDirNames: string[] = [];
  try {
    actionDirNames = await readdir(resolved.absolute, { withFileTypes: true }).then(
      (items) => items.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
    );
  } catch {
    return [];
  }

  const nested = await Promise.all(
    actionDirNames.map(async (actionDirName) => {
      const subProgramsRoot = join(resolved.absolute, actionDirName, "subprograms");
      if (!existsSync(subProgramsRoot)) return [] as ActionEmbeddedSubProgramMeta[];

      let subDirNames: string[] = [];
      try {
        subDirNames = await readdir(subProgramsRoot, { withFileTypes: true }).then(
          (items) => items.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
        );
      } catch {
        return [] as ActionEmbeddedSubProgramMeta[];
      }

      const entries = await Promise.all(
        subDirNames.map(async (subDirName) => {
          const infoAbsolute = join(subProgramsRoot, subDirName, "info.json");
          if (!existsSync(infoAbsolute)) return null;
          return readEmbeddedSubProgramMetaEntry(
            rootPath,
            actionDirName,
            subDirName,
            infoAbsolute,
          );
        }),
      );
      return entries.filter((entry): entry is ActionEmbeddedSubProgramMeta => entry !== null);
    }),
  );

  return nested.flat().sort((a, b) =>
    (a.title ?? a.dirName).localeCompare(b.title ?? b.dirName, undefined, {
      sensitivity: "base",
    }),
  );
}

export type BuildActionExplorerTreeOptions = {
  /** roots: project folders only (fast first paint); full: include file tree (default). */
  depth?: "roots" | "full";
};

function emptyActionExplorerTree(rootPath: string): ActionExplorerTree {
  return {
    rootPath,
    rootLabel: "动作项目",
    children: [],
  };
}

/** Fast path: top-level action projects from info.json only (no recursive file scan). */
export async function buildActionExplorerTreeRoots(): Promise<
  | { ok: true; tree: ActionExplorerTree }
  | { ok: false; error: string }
> {
  const rootPath = getActionsRootRelative();
  const resolved = resolveWorkspacePath(rootPath);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }

  if (!existsSync(resolved.absolute)) {
    return { ok: true, tree: emptyActionExplorerTree(rootPath) };
  }

  const projectMeta = await loadActionProjectMeta();
  const children = buildExplorerTreeFromProjectMeta(rootPath, projectMeta, [], []);
  return { ok: true, tree: { ...emptyActionExplorerTree(rootPath), children } };
}

export async function buildActionExplorerTree(
  options?: BuildActionExplorerTreeOptions,
): Promise<
  | { ok: true; tree: ActionExplorerTree }
  | { ok: false; error: string }
> {
  if (options?.depth === "roots") {
    return buildActionExplorerTreeRoots();
  }

  const rootPath = getActionsRootRelative();
  const resolved = resolveWorkspacePath(rootPath);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }

  if (!existsSync(resolved.absolute)) {
    return { ok: true, tree: emptyActionExplorerTree(rootPath) };
  }

  const [listed, projectMeta, embeddedSubProgramMeta] = await Promise.all([
    listWorkspaceFiles(rootPath, {
      recursive: true,
      maxEntries: 2000,
      includeFileSizes: false,
    }),
    loadActionProjectMeta(),
    loadEmbeddedSubProgramMeta(),
  ]);
  if (!listed.ok) {
    return { ok: false, error: listed.error };
  }

  const children = buildExplorerTreeFromProjectMeta(
    rootPath,
    projectMeta,
    listed.entries,
    embeddedSubProgramMeta,
  );
  return {
    ok: true,
    tree: {
      ...emptyActionExplorerTree(rootPath),
      children,
    },
  };
}

export async function readWorkspaceFileForApi(
  path: string,
  options?: { offset?: number; limit?: number },
) {
  return readWorkspaceFileForExplorer(path, options);
}

export async function writeWorkspaceFileForApi(path: string, content: string) {
  const guard = await guardActionProjectBindingWrite(path);
  if (!guard.ok) return guard;
  if (isActionSourceManagedPath(path)) return { ok: false as const, error: "源码身份和 checkpoint 由工具维护，不能通过普通文件写入覆盖。" };
  const target = resolveWorkspacePath(path); if (!target.ok) return target;
  try { return await withExternalSourceDocumentWrite(target.absolute, () => writeWorkspaceFile(path, content)); }
  catch (error) {
    if (!(error instanceof SourceDocumentOwnerError)) throw error;
    return { ok: false as const, code: error.code, error: error.message };
  }
}

const ACTIONS_ROOT_PREFIX = ".quicker/actions/";

/** Remove a single project directory under .quicker/actions (local workspace only). */
export async function deleteActionProjectFromWorkspace(
  projectRelativePath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resolved = resolveWorkspacePath(projectRelativePath);
  if (!resolved.ok) return resolved;

  const normalized = resolved.relative.replace(/\\/g, "/");
  if (!normalized.startsWith(ACTIONS_ROOT_PREFIX)) {
    return { ok: false, error: "只能删除 .quicker/actions 下的动作项目" };
  }
  const rel = normalized.slice(ACTIONS_ROOT_PREFIX.length);
  if (!rel || rel.includes("/")) {
    return { ok: false, error: "无效的项目路径" };
  }

  if (!existsSync(resolved.absolute)) {
    return { ok: false, error: "项目目录不存在" };
  }

  try {
    await withExternalSourceDocumentWrite(resolved.absolute, () => rm(resolved.absolute, { recursive: true, force: true }), true);
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "删除失败";
    return { ok: false, error: message };
  }
}

export function fileBaseName(path: string): string {
  return basename(path.replace(/\\/g, "/"));
}
