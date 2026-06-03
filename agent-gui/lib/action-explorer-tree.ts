import type { WorkspaceListEntry } from "@/lib/workspace-fs";

export type ExplorerTreeNode = {
  name: string;
  path: string;
  kind: "file" | "directory";
  /** Action project display title (top-level project dirs only). */
  title?: string;
  actionId?: string;
  children?: ExplorerTreeNode[];
};

export type ActionExplorerTree = {
  rootPath: string;
  rootLabel: string;
  children: ExplorerTreeNode[];
};

/** Compact change-detection key (faster than JSON.stringify for large trees). */
export function computeExplorerTreeSignature(tree: ActionExplorerTree): string {
  const lines: string[] = [tree.rootPath, tree.rootLabel];
  const walk = (nodes: ExplorerTreeNode[]) => {
    for (const node of nodes) {
      lines.push(
        `${node.path}\t${node.kind}\t${node.title ?? ""}\t${node.actionId ?? ""}\t${node.children?.length ?? 0}`,
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

type InternalNode = ExplorerTreeNode & {
  childMap: Map<string, InternalNode>;
};

export function buildExplorerTree(
  basePath: string,
  entries: WorkspaceListEntry[],
  projectMeta: ActionProjectMeta[] = [],
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
  return filterHiddenExplorerNodes(fromFiles, null, normalizedBase);
}

/**
 * Build action-project tree from local info.json scan (roots) + workspace file listing (children).
 * Project labels never come from qkrpc tool output — only from on-disk info.json.
 */
export function buildExplorerTreeFromProjectMeta(
  actionsRoot: string,
  projectMeta: ActionProjectMeta[],
  entries: WorkspaceListEntry[] = [],
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
    const children =
      childEntries.length > 0
        ? buildExplorerTree(projectPath, childEntries, [])
        : undefined;

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

  return filterHiddenExplorerNodes(sortTree(nodes), null, normalizedRoot);
}

/** Hide info.json / data.json under action project roots (opened via project row click). */
export function isHiddenExplorerTreeNode(
  node: ExplorerTreeNode,
  parent: ExplorerTreeNode | null,
  actionsRoot: string,
): boolean {
  if (node.kind !== "file") return false;
  const leaf = node.name.toLowerCase();
  if (leaf !== "info.json" && leaf !== "data.json") return false;
  if (!parent || parent.kind !== "directory") return false;
  return isActionProjectRootNode(parent, actionsRoot);
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
  if (!normalized.includes(".quicker/actions/")) return false;
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

export function formatShortActionId(actionId: string): string {
  const id = actionId.trim();
  if (id.length <= 13) return id;
  return `${id.slice(0, 8)}…`;
}

export function displayNodeLabel(
  node: ExplorerTreeNode,
  actionsRoot = ACTIONS_ROOT_SUFFIX,
): string {
  if (isActionProjectRootNode(node, actionsRoot)) {
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
  if (!isActionProjectRootNode(node, actionsRoot)) return null;
  if (node.title?.trim()) return null;
  const id = node.actionId?.trim();
  if (!id) return null;
  if (id.toLowerCase() === node.name.toLowerCase()) return null;
  return formatShortActionId(id);
}
