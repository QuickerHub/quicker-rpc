import { existsSync } from "node:fs";
import { basename } from "node:path";
import { rm } from "node:fs/promises";
import {
  buildGlobalSubProgramExplorerTreeFromProjectMeta,
  type ActionExplorerTree,
  type GlobalSubProgramProjectMeta,
} from "@/lib/action-explorer-tree";
import {
  listWorkspaceSubProgramProjects,
  type SubProgramProjectMeta,
} from "@/lib/subprogram-project-workflow";
import { getGlobalSubProgramsRootRelative } from "@/lib/workspace-program-target";
import {
  listWorkspaceFiles,
  readWorkspaceFileForExplorer,
  resolveWorkspacePath,
  writeWorkspaceFile,
} from "@/lib/workspace-fs";

export type BuildSubProgramExplorerTreeOptions = {
  depth?: "roots" | "full";
};

const SUBPROGRAMS_ROOT_PREFIX = ".quicker/subprograms/";

function emptySubProgramExplorerTree(rootPath: string): ActionExplorerTree {
  return {
    rootPath,
    rootLabel: "公共子程序",
    children: [],
  };
}

function toGlobalSubProgramProjectMeta(
  projects: SubProgramProjectMeta[],
): GlobalSubProgramProjectMeta[] {
  return projects.map((project) => ({
    dirName: project.dirName,
    path: project.path,
    name: project.name,
    subProgramId: project.subProgramId ?? project.dirName,
  }));
}

export async function loadGlobalSubProgramProjectMeta(): Promise<
  GlobalSubProgramProjectMeta[]
> {
  const listed = await listWorkspaceSubProgramProjects();
  if (!listed.ok) return [];
  return toGlobalSubProgramProjectMeta(listed.projects);
}

/** Fast path: top-level subprogram projects from info.json only. */
export async function buildSubProgramExplorerTreeRoots(): Promise<
  | { ok: true; tree: ActionExplorerTree }
  | { ok: false; error: string }
> {
  const rootPath = getGlobalSubProgramsRootRelative();
  const resolved = resolveWorkspacePath(rootPath);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }

  if (!existsSync(resolved.absolute)) {
    return { ok: true, tree: emptySubProgramExplorerTree(rootPath) };
  }

  const projectMeta = await loadGlobalSubProgramProjectMeta();
  const children = buildGlobalSubProgramExplorerTreeFromProjectMeta(
    rootPath,
    projectMeta,
    [],
  );
  return { ok: true, tree: { ...emptySubProgramExplorerTree(rootPath), children } };
}

export async function buildSubProgramExplorerTree(
  options?: BuildSubProgramExplorerTreeOptions,
): Promise<
  | { ok: true; tree: ActionExplorerTree }
  | { ok: false; error: string }
> {
  if (options?.depth === "roots") {
    return buildSubProgramExplorerTreeRoots();
  }

  const rootPath = getGlobalSubProgramsRootRelative();
  const resolved = resolveWorkspacePath(rootPath);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }

  if (!existsSync(resolved.absolute)) {
    return { ok: true, tree: emptySubProgramExplorerTree(rootPath) };
  }

  const [listed, projectMeta] = await Promise.all([
    listWorkspaceFiles(rootPath, {
      recursive: true,
      maxEntries: 2000,
      includeFileSizes: false,
    }),
    loadGlobalSubProgramProjectMeta(),
  ]);
  if (!listed.ok) {
    return { ok: false, error: listed.error };
  }

  const children = buildGlobalSubProgramExplorerTreeFromProjectMeta(
    rootPath,
    projectMeta,
    listed.entries,
  );
  return {
    ok: true,
    tree: {
      ...emptySubProgramExplorerTree(rootPath),
      children,
    },
  };
}

/** Remove a single project directory under .quicker/subprograms (local workspace only). */
export async function deleteSubProgramProjectFromWorkspace(
  projectRelativePath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resolved = resolveWorkspacePath(projectRelativePath);
  if (!resolved.ok) return resolved;

  const normalized = resolved.relative.replace(/\\/g, "/");
  if (!normalized.startsWith(SUBPROGRAMS_ROOT_PREFIX)) {
    return { ok: false, error: "只能删除 .quicker/subprograms 下的子程序项目" };
  }
  const rel = normalized.slice(SUBPROGRAMS_ROOT_PREFIX.length);
  if (!rel || rel.includes("/")) {
    return { ok: false, error: "无效的项目路径" };
  }

  if (!existsSync(resolved.absolute)) {
    return { ok: false, error: "项目目录不存在" };
  }

  try {
    await rm(resolved.absolute, { recursive: true, force: true });
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "删除失败";
    return { ok: false, error: message };
  }
}

export { readWorkspaceFileForExplorer as readWorkspaceFileForApi, writeWorkspaceFile as writeWorkspaceFileForApi };

export function fileBaseName(path: string): string {
  return basename(path.replace(/\\/g, "/"));
}
