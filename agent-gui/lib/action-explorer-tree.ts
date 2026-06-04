import type { WorkspaceListEntry } from "@/lib/workspace-fs";
import { getActionsRootRelative } from "@/lib/action-project-path-shared";
import { getGlobalSubProgramsRootRelative } from "@/lib/workspace-program-target";

export type ExplorerTreeNode = {
  name: string;
  path: string;
  kind: "file" | "directory";
  /** Display title from info.json (action project root or embedded subprogram root). */
  title?: string;
  actionId?: string;
  /** Embedded subprogram id from info.json (subprograms/{id} dirs). */
  subProgramId?: string;
  children?: ExplorerTreeNode[];
};

export type ActionEmbeddedSubProgramMeta = {
  /** Workspace-relative path to subprograms/{id} directory. */
  path: string;
  dirName: string;
  title?: string;
  subProgramId?: string;
};

export type ActionExplorerTree = {
  rootPath: string;
  rootLabel: string;
  children: ExplorerTreeNode[];
};

export const ACTION_EXPLORER_ROOT_LABEL = "动作项目";
export const SUBPROGRAM_EXPLORER_ROOT_LABEL = "公共子程序";

/** Placeholder tree: root folder only, children loaded asynchronously. */
export function createActionExplorerTreeShell(): ActionExplorerTree {
  return {
    rootPath: getActionsRootRelative(),
    rootLabel: ACTION_EXPLORER_ROOT_LABEL,
    children: [],
  };
}

/** Placeholder tree for global subprogram projects. */
export function createSubProgramExplorerTreeShell(): ActionExplorerTree {
  return {
    rootPath: getGlobalSubProgramsRootRelative(),
    rootLabel: SUBPROGRAM_EXPLORER_ROOT_LABEL,
    children: [],
  };
}

/** Compact change-detection key (faster than JSON.stringify for large trees). */
export function computeExplorerTreeSignature(tree: ActionExplorerTree): string {
  const lines: string[] = [tree.rootPath, tree.rootLabel];
  const walk = (nodes: ExplorerTreeNode[]) => {
    for (const node of nodes) {
      lines.push(
        `${node.path}\t${node.kind}\t${node.title ?? ""}\t${node.actionId ?? ""}\t${node.subProgramId ?? ""}\t${node.children?.length ?? 0}`,
      );
      if (node.children?.length) walk(node.children);
    }
  };
  walk(tree.children);
  return lines.join("\n");
}

export type ActionProjectMeta = {
  dirName: string;
  path: string;
  title?: string;
  actionId?: string;
};

export type GlobalSubProgramProjectMeta = {
  dirName: string;
  path: string;
  name?: string;
  subProgramId?: string;
};

type InternalNode = ExplorerTreeNode & {
  childMap: Map<string, InternalNode>;
};

export function buildExplorerTree(
  basePath: string,
  entries: WorkspaceListEntry[],
  projectMeta: ActionProjectMeta[] = [],
  embeddedSubProgramMeta: ActionEmbeddedSubProgramMeta[] = [],
): ExplorerTreeNode[] {
  const metaByDir = new Map<string, ActionProjectMeta>();
  for (const m of projectMeta) {
    metaByDir.set(m.dirName, m);
    if (m.actionId) {
      metaByDir.set(m.actionId.toLowerCase(), m);
    }
  }
  const rootMap = new Map<string, InternalNode>();
  const normalizedBase = basePath.replace(/\\/g, "/").replace(/\/+$/, "");

  for (const entry of entries) {
    const parts = entry.path.replace(/\\/g, "/").split("/").filter(Boolean);
    if (parts.length === 0) continue;

    let map = rootMap;
    let builtPath = normalizedBase;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      builtPath = `${builtPath}/${part}`;
      const isLast = i === parts.length - 1;

      let node = map.get(part);
      if (!node) {
        node = {
          name: part,
          path: builtPath,
          kind: isLast ? entry.kind : "directory",
          childMap: new Map(),
        };
        if (i === 0) {
          const meta =
            metaByDir.get(part)
            ?? metaByDir.get(part.toLowerCase());
          if (meta) {
            if (meta.title) node.title = meta.title;
            if (meta.actionId) node.actionId = meta.actionId;
          } else if (/^[0-9a-f-]{36}$/i.test(part)) {
            node.actionId = part;
          }
        }
        map.set(part, node);
      }

      if (isLast) {
        node.kind = entry.kind;
        node.path = builtPath;
      }
      map = node.childMap;
    }
  }

  const fromFiles = sortTree(toPublicList(rootMap));
  const withSubPrograms = applyEmbeddedSubProgramMeta(fromFiles, embeddedSubProgramMeta);
  return filterHiddenExplorerNodes(withSubPrograms, null, normalizedBase);
}

function embeddedSubProgramDirKey(path: string): string | null {
  const normalized = normalizeExplorerTreePath(path).toLowerCase();
  const marker = "/subprograms/";
  const idx = normalized.lastIndexOf(marker);
  if (idx < 0) return null;
  const dirName = normalized.slice(idx + marker.length).split("/")[0];
  return dirName || null;
}

/** Attach info.json titles to action-embedded subprogram directory nodes. */
export function applyEmbeddedSubProgramMeta(
  nodes: ExplorerTreeNode[],
  meta: ActionEmbeddedSubProgramMeta[] = [],
): ExplorerTreeNode[] {
  if (meta.length === 0) {
    return nodes.map((node) => ({
      ...node,
      children: node.children
        ? applyEmbeddedSubProgramMeta(node.children, meta)
        : undefined,
    }));
  }

  const metaByPath = new Map<string, ActionEmbeddedSubProgramMeta>();
  for (const item of meta) {
    const normalizedPath = normalizeExplorerTreePath(item.path);
    metaByPath.set(normalizedPath, item);
    metaByPath.set(item.dirName, item);
    metaByPath.set(item.dirName.toLowerCase(), item);
    metaByPath.set(`subprograms/${item.dirName}`.toLowerCase(), item);
    if (item.subProgramId) {
      metaByPath.set(item.subProgramId, item);
      metaByPath.set(item.subProgramId.toLowerCase(), item);
    }
  }

  const enrich = (node: ExplorerTreeNode): ExplorerTreeNode => {
    let next = node;
    if (isEmbeddedSubProgramRootNode(node)) {
      const key = normalizeExplorerTreePath(node.path);
      const dirKey = embeddedSubProgramDirKey(node.path);
      const hit =
        metaByPath.get(key)
        ?? (dirKey ? metaByPath.get(dirKey) : undefined)
        ?? metaByPath.get(node.name)
        ?? metaByPath.get(node.name.toLowerCase());
      if (hit) {
        next = {
          ...node,
          title: hit.title ?? node.title,
          subProgramId: hit.subProgramId ?? node.subProgramId,
        };
      }
    }

    return {
      ...next,
      children: next.children?.map(enrich),
    };
  };

  return nodes.map(enrich);
}

/**
 * Ensure subprograms/{id}/ folders from disk scan appear even when workspace file listing truncates.
 */
export function injectEmbeddedSubProgramsIntoProjectTree(
  projectPath: string,
  children: ExplorerTreeNode[] | undefined,
  embeddedSubProgramMeta: ActionEmbeddedSubProgramMeta[],
): ExplorerTreeNode[] {
  const projectKey = normalizeExplorerTreePath(projectPath).toLowerCase();
  const prefix = `${projectKey}/subprograms/`;
  const forProject = embeddedSubProgramMeta.filter((m) => {
    const p = normalizeExplorerTreePath(m.path).toLowerCase();
    return p.startsWith(prefix) && p.length > prefix.length;
  });
  if (forProject.length === 0) {
    return children ?? [];
  }

  const next = [...(children ?? [])];
  const subprogramsIdx = next.findIndex(
    (n) => n.kind === "directory" && n.name.toLowerCase() === "subprograms",
  );
  let subprogramsNode: ExplorerTreeNode;
  if (subprogramsIdx >= 0) {
    subprogramsNode = { ...next[subprogramsIdx]! };
    next.splice(subprogramsIdx, 1);
  } else {
    subprogramsNode = {
      name: "subprograms",
      path: `${normalizeExplorerTreePath(projectPath)}/subprograms`,
      kind: "directory",
    };
  }

  const subChildMap = new Map<string, ExplorerTreeNode>();
  for (const c of subprogramsNode.children ?? []) {
    subChildMap.set(c.name, c);
  }
  for (const m of forProject) {
    const existing = subChildMap.get(m.dirName);
    if (existing) {
      subChildMap.set(m.dirName, {
        ...existing,
        title: m.title ?? existing.title,
        subProgramId: m.subProgramId ?? existing.subProgramId,
      });
    } else {
      subChildMap.set(m.dirName, {
        name: m.dirName,
        path: normalizeExplorerTreePath(m.path),
        kind: "directory",
        title: m.title,
        subProgramId: m.subProgramId,
      });
    }
  }

  subprogramsNode = {
    ...subprogramsNode,
    children: sortTree([...subChildMap.values()]),
  };
  next.push(subprogramsNode);
  return sortTree(next);
}

/**
 * Build action-project tree from local info.json scan (roots) + workspace file listing (children).
 * Project labels never come from qkrpc tool output — only from on-disk info.json.
 */
export function buildExplorerTreeFromProjectMeta(
  actionsRoot: string,
  projectMeta: ActionProjectMeta[],
  entries: WorkspaceListEntry[] = [],
  embeddedSubProgramMeta: ActionEmbeddedSubProgramMeta[] = [],
): ExplorerTreeNode[] {
  const normalizedRoot = actionsRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  const entriesByDir = new Map<string, WorkspaceListEntry[]>();

  for (const entry of entries) {
    const parts = entry.path.replace(/\\/g, "/").split("/").filter(Boolean);
    if (parts.length === 0) continue;
    const dirName = parts[0]!;
    if (!entriesByDir.has(dirName)) {
      entriesByDir.set(dirName, []);
    }
    const rest = parts.slice(1).join("/");
    if (rest) {
      entriesByDir.get(dirName)!.push({ ...entry, path: rest });
    }
  }

  const metaByDir = new Map(projectMeta.map((m) => [m.dirName, m]));
  const dirNames = new Set<string>([
    ...projectMeta.map((m) => m.dirName),
    ...entriesByDir.keys(),
  ]);

  const nodes: ExplorerTreeNode[] = [];
  for (const dirName of dirNames) {
    const meta = metaByDir.get(dirName);
    const projectPath = meta?.path ?? `${normalizedRoot}/${dirName}`;
    const childEntries = entriesByDir.get(dirName) ?? [];
    const children = injectEmbeddedSubProgramsIntoProjectTree(
      projectPath,
      childEntries.length > 0
        ? buildExplorerTree(projectPath, childEntries, [], embeddedSubProgramMeta)
        : undefined,
      embeddedSubProgramMeta,
    );

    nodes.push({
      name: dirName,
      path: projectPath,
      kind: "directory",
      title: meta?.title,
      actionId:
        meta?.actionId
        ?? (/^[0-9a-f-]{36}$/i.test(dirName) ? dirName : undefined),
      children,
    });
  }

  const withSubPrograms = applyEmbeddedSubProgramMeta(sortTree(nodes), embeddedSubProgramMeta);
  return filterHiddenExplorerNodes(withSubPrograms, null, normalizedRoot);
}

/**
 * Build global subprogram-project tree from local info.json scan + workspace file listing.
 */
export function buildGlobalSubProgramExplorerTreeFromProjectMeta(
  subprogramsRoot: string,
  projectMeta: GlobalSubProgramProjectMeta[],
  entries: WorkspaceListEntry[] = [],
): ExplorerTreeNode[] {
  const normalizedRoot = subprogramsRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  const entriesByDir = new Map<string, WorkspaceListEntry[]>();

  for (const entry of entries) {
    const parts = entry.path.replace(/\\/g, "/").split("/").filter(Boolean);
    if (parts.length === 0) continue;
    const dirName = parts[0]!;
    if (!entriesByDir.has(dirName)) {
      entriesByDir.set(dirName, []);
    }
    const rest = parts.slice(1).join("/");
    if (rest) {
      entriesByDir.get(dirName)!.push({ ...entry, path: rest });
    }
  }

  const metaByDir = new Map(projectMeta.map((m) => [m.dirName, m]));
  const dirNames = new Set<string>([
    ...projectMeta.map((m) => m.dirName),
    ...entriesByDir.keys(),
  ]);

  const nodes: ExplorerTreeNode[] = [];
  for (const dirName of dirNames) {
    const meta = metaByDir.get(dirName);
    const projectPath = meta?.path ?? `${normalizedRoot}/${dirName}`;
    const childEntries = entriesByDir.get(dirName) ?? [];
    const children =
      childEntries.length > 0
        ? buildExplorerTree(projectPath, childEntries, [], [])
        : undefined;

    nodes.push({
      name: dirName,
      path: projectPath,
      kind: "directory",
      title: meta?.name,
      subProgramId: meta?.subProgramId ?? dirName,
      children,
    });
  }

  return filterHiddenExplorerNodes(sortTree(nodes), null, normalizedRoot);
}

/** Hide info.json / data.json under action or embedded subprogram project roots. */
export function isHiddenExplorerTreeNode(
  node: ExplorerTreeNode,
  parent: ExplorerTreeNode | null,
  actionsRoot: string,
): boolean {
  if (node.kind !== "file") return false;
  const leaf = node.name.toLowerCase();
  if (leaf !== "info.json" && leaf !== "data.json") return false;
  if (!parent || parent.kind !== "directory") return false;
  return (
    isActionProjectRootNode(parent, actionsRoot)
    || isEmbeddedSubProgramRootNode(parent)
    || isGlobalSubProgramRootNode(parent)
  );
}

function filterHiddenExplorerNodes(
  nodes: ExplorerTreeNode[],
  parent: ExplorerTreeNode | null,
  actionsRoot: string,
): ExplorerTreeNode[] {
  return nodes
    .filter((node) => !isHiddenExplorerTreeNode(node, parent, actionsRoot))
    .map((node) => ({
      ...node,
      children: node.children
        ? filterHiddenExplorerNodes(node.children, node, actionsRoot)
        : undefined,
    }));
}

function toPublicList(map: Map<string, InternalNode>): ExplorerTreeNode[] {
  return [...map.values()].map(toPublicNode);
}

function toPublicNode(node: InternalNode): ExplorerTreeNode {
  const children = node.childMap.size > 0 ? sortTree(toPublicList(node.childMap)) : undefined;
  return {
    name: node.name,
    path: node.path,
    kind: node.kind,
    title: node.title,
    actionId: node.actionId,
    children,
  };
}

function sortTree(nodes: ExplorerTreeNode[]): ExplorerTreeNode[] {
  return nodes
    .map((node) => ({
      ...node,
      children: node.children ? sortTree(node.children) : undefined,
    }))
    .sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === "directory" ? -1 : 1;
      }
      const labelA = a.title ?? a.name;
      const labelB = b.title ?? b.name;
      return labelA.localeCompare(labelB, undefined, { sensitivity: "base" });
    });
}

/** Canonical path keys for explorer expand/collapse state. */
export function normalizeExplorerTreePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/** Find a node by canonical path (for selection / open guards). */
export function findExplorerTreeNode(
  tree: ActionExplorerTree,
  path: string,
): ExplorerTreeNode | null {
  const target = normalizeExplorerTreePath(path);
  const walk = (nodes: ExplorerTreeNode[]): ExplorerTreeNode | null => {
    for (const node of nodes) {
      if (normalizeExplorerTreePath(node.path) === target) return node;
      if (node.children?.length) {
        const found = walk(node.children);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(tree.children);
}

/** Known action-project folder segments (no file extension). */
const ACTION_PROJECT_DIRECTORY_LEAVES = new Set(["files"]);

/** Folder row in the tree (directory or known folder name like `files`). */
export function isActionProjectFolderNode(node: ExplorerTreeNode): boolean {
  if (node.kind === "directory") return true;
  const leaf = normalizeExplorerTreePath(node.path).split("/").pop() ?? "";
  return ACTION_PROJECT_DIRECTORY_LEAVES.has(leaf);
}

export function isExplorerTreeDirectoryPath(
  tree: ActionExplorerTree | null | undefined,
  path: string | null | undefined,
): boolean {
  if (!path?.trim()) return false;
  const normalized = normalizeExplorerTreePath(path).replace(/\/+$/, "");
  if (tree) {
    const node = findExplorerTreeNode(tree, normalized);
    if (node?.kind === "directory") return true;
  }
  if (
    !normalized.includes(".quicker/actions/")
    && !normalized.includes(".quicker/subprograms/")
  ) {
    return false;
  }
  const leaf = normalized.split("/").pop() ?? "";
  return ACTION_PROJECT_DIRECTORY_LEAVES.has(leaf);
}

export function isExplorerTreePathExpanded(
  expandedPaths: Set<string>,
  path: string,
): boolean {
  return expandedPaths.has(normalizeExplorerTreePath(path));
}

export function getAncestorDirectoryPaths(filePath: string): string[] {
  const parts = filePath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length <= 1) return [];
  const dirs: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    dirs.push(parts.slice(0, i).join("/"));
  }
  return dirs;
}

const ACTIONS_ROOT_SUFFIX = ".quicker/actions";
const SUBPROGRAMS_ROOT_SUFFIX = ".quicker/subprograms";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveActionProjectId(node: ExplorerTreeNode): string | undefined {
  const fromMeta = node.actionId?.trim();
  if (fromMeta && UUID_RE.test(fromMeta)) return fromMeta;
  const name = node.name.trim();
  if (UUID_RE.test(name)) return name;
  return fromMeta || undefined;
}

/**
 * True only for direct children of `.quicker/actions` (one path segment).
 * Ignores a mistaken `actionsRoot` such as a project directory path.
 */
export function isActionProjectRootNode(
  node: ExplorerTreeNode,
  _actionsRoot = ACTIONS_ROOT_SUFFIX,
): boolean {
  void _actionsRoot;
  if (node.kind !== "directory") return false;
  const normalizedRoot = ACTIONS_ROOT_SUFFIX.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalizedPath = node.path.replace(/\\/g, "/");
  if (!normalizedPath.startsWith(`${normalizedRoot}/`)) return false;
  const rel = normalizedPath.slice(normalizedRoot.length + 1);
  return rel.length > 0 && !rel.includes("/");
}

/** Direct child of `subprograms/` under an action project (one segment after subprograms). */
export function isEmbeddedSubProgramRootNode(node: ExplorerTreeNode): boolean {
  if (node.kind !== "directory") return false;
  const normalized = normalizeExplorerTreePath(node.path);
  if (!normalized.includes("/actions/") || !normalized.includes("/subprograms/")) {
    return false;
  }
  const after = normalized.split("/subprograms/")[1] ?? "";
  return after.length > 0 && !after.includes("/");
}

/** Direct child of `.quicker/subprograms` (global subprogram project root). */
export function isGlobalSubProgramRootNode(node: ExplorerTreeNode): boolean {
  if (node.kind !== "directory") return false;
  const normalizedRoot = SUBPROGRAMS_ROOT_SUFFIX.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalizedPath = node.path.replace(/\\/g, "/");
  if (!normalizedPath.startsWith(`${normalizedRoot}/`)) return false;
  const rel = normalizedPath.slice(normalizedRoot.length + 1);
  return rel.length > 0 && !rel.includes("/");
}

/** Relative path to a project root's info.json, or null if not a project root. */
export function actionProjectInfoJsonPath(
  node: ExplorerTreeNode,
  actionsRoot = ACTIONS_ROOT_SUFFIX,
): string | null {
  if (!isActionProjectRootNode(node, actionsRoot)) return null;
  return `${node.path.replace(/\\/g, "/")}/info.json`;
}

/** Relative path to a project root's data.json (step editor), or null if not a project root. */
export function actionProjectDataJsonPath(
  node: ExplorerTreeNode,
  actionsRoot = ACTIONS_ROOT_SUFFIX,
): string | null {
  if (!isActionProjectRootNode(node, actionsRoot)) return null;
  return `${node.path.replace(/\\/g, "/")}/data.json`;
}

/** Relative path to embedded subprogram data.json, or null if not a subprogram root. */
export function actionEmbeddedSubProgramDataJsonPath(
  node: ExplorerTreeNode,
): string | null {
  if (!isEmbeddedSubProgramRootNode(node)) return null;
  return `${node.path.replace(/\\/g, "/")}/data.json`;
}

/** Relative path to global subprogram data.json, or null if not a project root. */
export function globalSubProgramDataJsonPath(node: ExplorerTreeNode): string | null {
  if (!isGlobalSubProgramRootNode(node)) return null;
  return `${node.path.replace(/\\/g, "/")}/data.json`;
}

/** Open target for a tree row (action root or embedded subprogram root). */
export function explorerProgramDataJsonPath(
  node: ExplorerTreeNode,
  actionsRoot = ACTIONS_ROOT_SUFFIX,
): string | null {
  return (
    actionProjectDataJsonPath(node, actionsRoot)
    ?? actionEmbeddedSubProgramDataJsonPath(node)
    ?? globalSubProgramDataJsonPath(node)
  );
}

export function formatShortActionId(actionId: string): string {
  const id = actionId.trim();
  if (id.length <= 13) return id;
  return `${id.slice(0, 8)}…`;
}

export function displayNodeLabel(
  node: ExplorerTreeNode,
  actionsRoot = ACTIONS_ROOT_SUFFIX,
): string {
  if (isProgramRootNode(node, actionsRoot)) {
    const title = node.title?.trim();
    if (title) return title;
    if (!/^[0-9a-f-]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(node.name)) {
      return node.name;
    }
    return "（无标题）";
  }
  return node.name;
}

export function displayNodeSubtitle(
  node: ExplorerTreeNode,
  actionsRoot = ACTIONS_ROOT_SUFFIX,
): string | null {
  if (!isProgramRootNode(node, actionsRoot)) return null;
  if (node.title?.trim()) return null;
  const id = (node.subProgramId ?? node.actionId)?.trim();
  if (!id) return null;
  if (id.toLowerCase() === node.name.toLowerCase()) return null;
  return formatShortActionId(id);
}

function isProgramRootNode(
  node: ExplorerTreeNode,
  actionsRoot: string,
): boolean {
  return isActionProjectRootNode(node, actionsRoot)
    || isEmbeddedSubProgramRootNode(node)
    || isGlobalSubProgramRootNode(node);
}
