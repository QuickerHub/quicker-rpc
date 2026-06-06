"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { ActionExplorerTree, ExplorerTreeNode } from "@/lib/action-explorer-tree";
import {
  computeExplorerTreeSignature,
  createActionExplorerTreeShell,
  createSubProgramExplorerTreeShell,
  findExplorerTreeNode,
  getAncestorDirectoryPaths,
  isExplorerTreeDirectoryPath,
  normalizeExplorerTreePath,
} from "@/lib/action-explorer-tree";
import { loadExplorerOpen, loadExplorerPanelView, loadChatColumnWidth, storeExplorerOpen, storeExplorerPanelView, storeChatColumnWidth, clampChatColumnWidth } from "@/lib/explorer-prefs";
import {
  getWorkspaceFileEditorPreview,
  isWorkspaceExplorerFileTool,
} from "@/lib/workspace-file-tool";
import {
  fetchActionExplorerTree,
  fetchWorkspaceFile,
  formatWorkspaceFetchError,
  subscribeActionExplorerTreeWatch,
  writeWorkspaceFileApi,
} from "@/lib/workspace-explorer-api";
import type { StructuredToolResult } from "@/lib/tool-result";
import { isActionProjectDataPath } from "@/lib/action-project-data-parse";
import { basenamePath } from "@/lib/workspace-file-tool";
import { clearWorkspaceMainEditorDoc } from "@/lib/workspace-main-editor-tab";
import {
  SIDE_PANEL_PREVIEW_TAB_ID,
  SIDE_PANEL_VIEW_BROWSER,
  SIDE_PANEL_VIEW_EXPLORER,
} from "@/lib/workspace-side-panel-view";

export type ExplorerFileTab = {
  id: string;
  path: string;
  /** Tab title (defaults to file basename). */
  label?: string;
  content: string;
  truncated?: boolean;
  totalChars?: number;
  loading?: boolean;
  error?: string;
};

const PREVIEW_TAB_ID = "__preview__";
const FILE_CONTENT_CACHE_MAX = 48;

/** Set by chat when `qkrpc_action_create` completes; flushed after fs-watch tree updates. */
let pendingRevealActionId: string | null = null;

/** Queue opening a new action project once the explorer tree reflects fs changes. */
export function queueRevealActionProjectById(actionId: string): void {
  const id = actionId.trim().toLowerCase();
  pendingRevealActionId = id || null;
}

function isWorkspaceFileWriteTool(toolName: string): boolean {
  return (
    toolName === "workspace_action_file_write"
    || toolName === "workspace_action_write_data"
  );
}

type CachedFileContent = {
  content: string;
  truncated?: boolean;
  totalChars?: number;
};

function normalizeExplorerPath(path: string): string {
  return normalizeExplorerTreePath(path);
}

function computeCombinedExplorerTreeSignature(
  actionTree: ActionExplorerTree,
  subprogramTree: ActionExplorerTree,
): string {
  return `${computeExplorerTreeSignature(actionTree)}\n---\n${computeExplorerTreeSignature(subprogramTree)}`;
}

function applyExplorerTreesSnapshot(
  nextTree: ActionExplorerTree,
  nextSubprogramTree: ActionExplorerTree,
  treeRef: MutableRefObject<ActionExplorerTree | null>,
  subprogramTreeRef: MutableRefObject<ActionExplorerTree | null>,
  treeSignatureRef: MutableRefObject<string | null>,
  setters: {
    setTree: Dispatch<SetStateAction<ActionExplorerTree | null>>;
    setSubprogramTree: Dispatch<SetStateAction<ActionExplorerTree | null>>;
    setTreeError: Dispatch<SetStateAction<string | null>>;
    setTreeLoading: Dispatch<SetStateAction<boolean>>;
  },
): boolean {
  const signature = computeCombinedExplorerTreeSignature(nextTree, nextSubprogramTree);
  if (treeSignatureRef.current === signature) {
    return false;
  }
  treeSignatureRef.current = signature;
  treeRef.current = nextTree;
  subprogramTreeRef.current = nextSubprogramTree;
  setters.setTree(nextTree);
  setters.setSubprogramTree(nextSubprogramTree);
  setters.setTreeError(null);
  setters.setTreeLoading(false);
  return true;
}

function addPathsToExpandedSet(
  prev: Set<string>,
  path: string,
  collapsed: ReadonlySet<string>,
): Set<string> {
  const normalized = normalizeExplorerPath(path);
  let changed = false;
  const next = new Set(prev);
  const addDir = (dir: string) => {
    const key = normalizeExplorerPath(dir);
    if (collapsed.has(key)) return;
    if (!next.has(key)) {
      next.add(key);
      changed = true;
    }
  };
  addDir(normalized);
  for (const dir of getAncestorDirectoryPaths(normalized)) {
    addDir(dir);
  }
  return changed ? next : prev;
}

function removeExpandedDescendants(next: Set<string>, dirPath: string): void {
  const prefix = `${normalizeExplorerPath(dirPath)}/`;
  for (const p of [...next]) {
    if (p.startsWith(prefix)) next.delete(p);
  }
}

function clearCollapsedAncestors(collapsed: Set<string>, filePath: string): void {
  for (const dir of getAncestorDirectoryPaths(normalizeExplorerPath(filePath))) {
    collapsed.delete(normalizeExplorerPath(dir));
  }
}

function restoreExplorerActionTreeView(
  cwd: string,
  actionRootPath: string,
  subprogramRootPath: string,
  collapsedPathsRef: MutableRefObject<Set<string>>,
  setExpandedPaths: Dispatch<SetStateAction<Set<string>>>,
): void {
  const normalizedActionRoot = normalizeExplorerPath(actionRootPath);
  const normalizedSubprogramRoot = normalizeExplorerPath(subprogramRootPath);

  const saved = loadExplorerPanelView(cwd);
  if (saved) {
    collapsedPathsRef.current = new Set(
      saved.actionTree.collapsedPaths.map(normalizeExplorerPath),
    );
    const expanded = saved.actionTree.expandedPaths.map(normalizeExplorerPath);
    setExpandedPaths(new Set(expanded));
    return;
  }

  collapsedPathsRef.current = new Set([
    normalizedActionRoot,
    normalizedSubprogramRoot,
  ]);
  setExpandedPaths(new Set());
}

const EXPLORER_TREE_VIEW_PERSIST_MS = 250;

function applyExplorerTreeShell(
  treeRef: MutableRefObject<ActionExplorerTree | null>,
  subprogramTreeRef: MutableRefObject<ActionExplorerTree | null>,
  treeSignatureRef: MutableRefObject<string | null>,
  setters: {
    setTree: Dispatch<SetStateAction<ActionExplorerTree | null>>;
    setSubprogramTree: Dispatch<SetStateAction<ActionExplorerTree | null>>;
    setTreeError: Dispatch<SetStateAction<string | null>>;
    setTreeChildrenLoading: Dispatch<SetStateAction<boolean>>;
  },
): ActionExplorerTree {
  const shell = createActionExplorerTreeShell();
  const subprogramShell = createSubProgramExplorerTreeShell();
  const signature = computeCombinedExplorerTreeSignature(shell, subprogramShell);
  treeRef.current = shell;
  subprogramTreeRef.current = subprogramShell;
  treeSignatureRef.current = signature;
  setters.setTree(shell);
  setters.setSubprogramTree(subprogramShell);
  setters.setTreeError(null);
  setters.setTreeChildrenLoading(true);
  return shell;
}

export type WorkspaceExplorerTreeContextValue = {
  cwd: string;
  tree: ActionExplorerTree | null;
  subprogramTree: ActionExplorerTree | null;
  treeLoading: boolean;
  /** True while project rows under the actions root are still loading. */
  treeChildrenLoading: boolean;
  treeError: string | null;
  refreshTree: (options?: { silent?: boolean }) => Promise<void>;
  expandedPaths: Set<string>;
  toggleExpanded: (path: string) => void;
  expandPath: (path: string) => void;
  selectedPath: string | null;
  setSelectedPath: (path: string | null) => void;
};

export type WorkspaceExplorerEditorContextValue = {
  cwd: string;
  tabs: ExplorerFileTab[];
  activeTabId: string | null;
  activeTab: ExplorerFileTab | null;
  openFile: (
    path: string,
    content?: string,
    meta?: {
      truncated?: boolean;
      totalChars?: number;
      revealInTree?: boolean;
      tabLabel?: string;
    },
  ) => void;
  openFileFromTool: (toolName: string, input: unknown, output?: StructuredToolResult) => void;
  closeTab: (id: string) => void;
  setActiveTabId: (id: string | null) => void;
  loadFileContent: (path: string) => Promise<void>;
  saveWorkspaceFile: (
    path: string,
    content: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  revealPath: (path: string) => void;
  revealActionProjectById: (actionId: string) => void;
};

type WorkspaceExplorerContextValue = WorkspaceExplorerTreeContextValue &
  WorkspaceExplorerEditorContextValue & {
    panelOpen: boolean;
    setPanelOpen: (open: boolean) => void;
    togglePanel: () => void;
  };

const WorkspaceExplorerTreeContext =
  createContext<WorkspaceExplorerTreeContextValue | null>(null);
const WorkspaceExplorerEditorContext =
  createContext<WorkspaceExplorerEditorContextValue | null>(null);
const WorkspaceExplorerContext = createContext<WorkspaceExplorerContextValue | null>(null);

type WorkspaceExplorerShellContextValue = {
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  chatColumnWidth: number | null;
  setChatColumnWidth: (
    width: number,
    containerWidth: number,
    persist?: boolean,
  ) => void;
  activeSideView: string;
  setActiveSideView: (viewId: string) => void;
  focusSidePanelView: (viewId: string) => void;
};

const WorkspaceExplorerShellContext =
  createContext<WorkspaceExplorerShellContextValue | null>(null);

/** Panel open/close only — wraps the app shell so the titlebar toggle does not subscribe to tree updates. */
export function WorkspaceExplorerShellProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [panelOpen, setPanelOpenState] = useState(true);
  const [chatColumnWidth, setChatColumnWidthState] = useState<number | null>(
    null,
  );
  const [activeSideView, setActiveSideViewState] = useState(SIDE_PANEL_VIEW_EXPLORER);

  useEffect(() => {
    setPanelOpenState(loadExplorerOpen());
    setChatColumnWidthState(loadChatColumnWidth());
  }, []);

  const setPanelOpen = useCallback((open: boolean) => {
    setPanelOpenState((prev) => {
      if (prev === open) return prev;
      storeExplorerOpen(open);
      return open;
    });
  }, []);

  const setActiveSideView = useCallback((viewId: string) => {
    setActiveSideViewState((prev) => (prev === viewId ? prev : viewId));
  }, []);

  const focusSidePanelView = useCallback((viewId: string) => {
    setPanelOpen(true);
    setActiveSideViewState(viewId);
  }, [setPanelOpen]);

  const togglePanel = useCallback(() => {
    setPanelOpenState((prev) => {
      const next = !prev;
      storeExplorerOpen(next);
      return next;
    });
  }, []);

  const setChatColumnWidth = useCallback(
    (width: number, containerWidth: number, persist = false) => {
      const next = clampChatColumnWidth(width, containerWidth);
      setChatColumnWidthState((prev) => {
        if (prev === next) return prev;
        if (persist) storeChatColumnWidth(next, containerWidth);
        return next;
      });
    },
    [],
  );

  const shellValue = useMemo(
    () => ({
      panelOpen,
      setPanelOpen,
      togglePanel,
      chatColumnWidth,
      setChatColumnWidth,
      activeSideView,
      setActiveSideView,
      focusSidePanelView,
    }),
    [
      panelOpen,
      setPanelOpen,
      togglePanel,
      chatColumnWidth,
      setChatColumnWidth,
      activeSideView,
      setActiveSideView,
      focusSidePanelView,
    ],
  );

  workspaceExplorerActionsRef.current = {
    ...workspaceExplorerActionsRef.current,
    setPanelOpen,
    setActiveSideView,
    focusSidePanelView,
  };

  return (
    <WorkspaceExplorerShellContext.Provider value={shellValue}>
      {children}
    </WorkspaceExplorerShellContext.Provider>
  );
}

export function useWorkspaceExplorerShell(): WorkspaceExplorerShellContextValue {
  const ctx = useContext(WorkspaceExplorerShellContext);
  if (!ctx) {
    throw new Error(
      "useWorkspaceExplorerShell must be used within WorkspaceExplorerShellProvider",
    );
  }
  return ctx;
}

export type WorkspaceExplorerActions = Pick<
  WorkspaceExplorerContextValue,
  | "openFile"
  | "openFileFromTool"
  | "revealPath"
  | "revealActionProjectById"
  | "setPanelOpen"
  | "refreshTree"
> & {
  notifyProjectRemoved: () => void;
  setActiveSideView: (viewId: string) => void;
  focusSidePanelView: (viewId: string) => void;
};

const noop = (): void => {};

const stubExplorerActions: WorkspaceExplorerActions = {
  openFile: noop,
  openFileFromTool: noop,
  revealPath: noop,
  revealActionProjectById: noop,
  setPanelOpen: noop,
  refreshTree: async () => {},
  notifyProjectRemoved: noop,
  setActiveSideView: noop,
  focusSidePanelView: noop,
};

/** Updated by the panel provider; chat reads via useWorkspaceExplorerActions without re-rendering on tree changes. */
export const workspaceExplorerActionsRef: MutableRefObject<WorkspaceExplorerActions> =
  { current: stubExplorerActions };

/** Latest editor snapshot for tree UI (avoids tree pane subscribing to tab state). */
export const workspaceExplorerEditorStateRef: MutableRefObject<{
  activeTab: ExplorerFileTab | null;
  closeTab: (id: string) => void;
}> = {
  current: { activeTab: null, closeTab: () => {} },
};

/** Scoped to the right explorer panel so fs-watch tree updates do not re-render the chat column. */
export function WorkspaceExplorerPanelProvider({
  cwd,
  cwdPending = false,
  children,
}: {
  cwd: string;
  /** True while default workspace cwd is still resolving on first load. */
  cwdPending?: boolean;
  children: ReactNode;
}) {
  const { panelOpen, setPanelOpen, togglePanel, setActiveSideView, focusSidePanelView } =
    useWorkspaceExplorerShell();
  const initialShell = useMemo(() => createActionExplorerTreeShell(), []);
  const initialSubprogramShell = useMemo(() => createSubProgramExplorerTreeShell(), []);
  const [tree, setTree] = useState<ActionExplorerTree | null>(() => initialShell);
  const [subprogramTree, setSubprogramTree] = useState<ActionExplorerTree | null>(
    () => initialSubprogramShell,
  );
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeChildrenLoading, setTreeChildrenLoading] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [tabs, setTabs] = useState<ExplorerFileTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const cwdRef = useRef(cwd);
  const cwdPendingRef = useRef(cwdPending);
  const treeRef = useRef<ActionExplorerTree | null>(null);
  const subprogramTreeRef = useRef<ActionExplorerTree | null>(null);
  const treeSignatureRef = useRef<string | null>(null);
  const fileContentCacheRef = useRef<Map<string, CachedFileContent>>(new Map());
  /** User-collapsed folders; expandPath must not re-open them until user expands or opens a file inside. */
  const collapsedPathsRef = useRef<Set<string>>(new Set());
  const expandedPathsRef = useRef(expandedPaths);
  expandedPathsRef.current = expandedPaths;
  const persistTreeViewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedulePersistExplorerTreeView = useCallback(() => {
    const activeCwd = cwdRef.current.trim();
    if (!activeCwd) return;
    if (persistTreeViewTimerRef.current) {
      clearTimeout(persistTreeViewTimerRef.current);
    }
    persistTreeViewTimerRef.current = setTimeout(() => {
      persistTreeViewTimerRef.current = null;
      storeExplorerPanelView(activeCwd, {
        actionTree: {
          expandedPaths: [...expandedPathsRef.current],
          collapsedPaths: [...collapsedPathsRef.current],
        },
      });
    }, EXPLORER_TREE_VIEW_PERSIST_MS);
  }, []);

  const readFileCache = useCallback((path: string): CachedFileContent | undefined => {
    return fileContentCacheRef.current.get(normalizeExplorerPath(path));
  }, []);

  const writeFileCache = useCallback((path: string, entry: CachedFileContent) => {
    const key = normalizeExplorerPath(path);
    const map = fileContentCacheRef.current;
    if (map.has(key)) map.delete(key);
    map.set(key, entry);
    while (map.size > FILE_CONTENT_CACHE_MAX) {
      const oldest = map.keys().next().value;
      if (!oldest) break;
      map.delete(oldest);
    }
  }, []);

  useEffect(() => {
    cwdRef.current = cwd;
    cwdPendingRef.current = cwdPending;
  }, [cwd, cwdPending]);

  /** Manual fallback when watch is unavailable; normal updates use fs watch SSE. */
  const refreshTree = useCallback(async (options?: { silent?: boolean }) => {
    const activeCwd = cwdRef.current.trim();
    if (!activeCwd) {
      setTree(null);
      setSubprogramTree(null);
      treeRef.current = null;
      subprogramTreeRef.current = null;
      treeSignatureRef.current = null;
      if (!cwdPendingRef.current) {
        setTreeError("未设置工作目录");
      }
      return;
    }
    const silent = options?.silent ?? false;
    if (!silent) {
      setTreeLoading(true);
    }
    setTreeError((err) => (err === null ? err : null));
    try {
      const result = await fetchActionExplorerTree(activeCwd);
      if (!result.ok) {
        setTreeError(result.error);
        setTree(null);
        setSubprogramTree(null);
        treeRef.current = null;
        subprogramTreeRef.current = null;
        treeSignatureRef.current = null;
        return;
      }
      applyExplorerTreesSnapshot(
        result.tree,
        result.subprogramTree,
        treeRef,
        subprogramTreeRef,
        treeSignatureRef,
        {
          setTree,
          setSubprogramTree,
          setTreeError,
          setTreeLoading,
        },
      );
    } finally {
      setTreeLoading(false);
    }
  }, []);

  const tryFlushPendingRevealRef = useRef<() => void>(() => {});

  const applyTreeUpdate = useCallback(
    (nextTree: ActionExplorerTree, nextSubprogramTree: ActionExplorerTree) => {
      const changed = applyExplorerTreesSnapshot(
        nextTree,
        nextSubprogramTree,
        treeRef,
        subprogramTreeRef,
        treeSignatureRef,
        {
          setTree,
          setSubprogramTree,
          setTreeError,
          setTreeLoading,
        },
      );
      if (!changed) return;
      queueMicrotask(() => {
        tryFlushPendingRevealRef.current();
      });
    },
    [],
  );

  const applyTreeUpdateRef = useRef(applyTreeUpdate);
  applyTreeUpdateRef.current = applyTreeUpdate;

  useLayoutEffect(() => {
    const activeCwd = cwd.trim();
    const shell = createActionExplorerTreeShell();
    const subprogramShell = createSubProgramExplorerTreeShell();
    if (!activeCwd) {
      return;
    }
    restoreExplorerActionTreeView(
      activeCwd,
      shell.rootPath,
      subprogramShell.rootPath,
      collapsedPathsRef,
      setExpandedPaths,
    );
  }, [cwd, cwdPending]);

  useEffect(() => {
    const activeCwd = cwd.trim();
    if (!activeCwd) {
      treeRef.current = null;
      subprogramTreeRef.current = null;
      treeSignatureRef.current = null;
      if (!cwdPending) {
        setTree(null);
        setSubprogramTree(null);
        setTreeError("未设置工作目录");
        setTreeChildrenLoading(false);
        setTreeLoading(false);
      } else {
        applyExplorerTreeShell(treeRef, subprogramTreeRef, treeSignatureRef, {
          setTree,
          setSubprogramTree,
          setTreeError,
          setTreeChildrenLoading,
        });
      }
      return;
    }

    let cancelled = false;
    let unsubscribeWatch: (() => void) | undefined;
    treeRef.current = null;
    subprogramTreeRef.current = null;
    treeSignatureRef.current = null;
    setTreeError(null);
    setTreeLoading(false);

    applyExplorerTreeShell(treeRef, subprogramTreeRef, treeSignatureRef, {
      setTree,
      setSubprogramTree,
      setTreeError,
      setTreeChildrenLoading,
    });

    void (async () => {
      const roots = await fetchActionExplorerTree(activeCwd, { depth: "roots" });
      if (cancelled) return;
      if (roots.ok) {
        applyTreeUpdateRef.current(roots.tree, roots.subprogramTree);
      }

      const full = await fetchActionExplorerTree(activeCwd);
      if (cancelled) return;
      if (full.ok) {
        applyTreeUpdateRef.current(full.tree, full.subprogramTree);
      } else if (!roots.ok) {
        setTreeError(full.error);
      }

      setTreeChildrenLoading(false);

      if (cancelled) return;
      unsubscribeWatch = subscribeActionExplorerTreeWatch(activeCwd, {
        onTree: (tree, subprogramTree) => {
          if (cancelled) return;
          applyTreeUpdateRef.current(tree, subprogramTree);
        },
        onError: (error) => {
          if (cancelled) return;
          setTreeError((prev) => (prev === error ? prev : error));
        },
      });
    })();

    return () => {
      cancelled = true;
      unsubscribeWatch?.();
    };
  }, [cwd, cwdPending]);

  useEffect(() => {
    const activeCwd = cwd.trim();
    if (!activeCwd) return;
    schedulePersistExplorerTreeView();
    return () => {
      if (persistTreeViewTimerRef.current) {
        clearTimeout(persistTreeViewTimerRef.current);
        persistTreeViewTimerRef.current = null;
        const latestCwd = cwdRef.current.trim();
        if (latestCwd) {
          storeExplorerPanelView(latestCwd, {
            actionTree: {
              expandedPaths: [...expandedPathsRef.current],
              collapsedPaths: [...collapsedPathsRef.current],
            },
          });
        }
      }
    };
  }, [cwd, expandedPaths, schedulePersistExplorerTreeView]);

  const expandPath = useCallback((path: string) => {
    clearCollapsedAncestors(collapsedPathsRef.current, path);
    setExpandedPaths((prev) =>
      addPathsToExpandedSet(prev, path, collapsedPathsRef.current),
    );
  }, []);

  const toggleExpanded = useCallback((path: string) => {
    const normalized = normalizeExplorerPath(path);
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      const collapsed = collapsedPathsRef.current;
      if (next.has(normalized)) {
        next.delete(normalized);
        removeExpandedDescendants(next, normalized);
        collapsed.add(normalized);
      } else {
        next.add(normalized);
        collapsed.delete(normalized);
      }
      return next;
    });
  }, []);

  const revealPath = useCallback(
    (path: string) => {
      expandPath(path);
      setSelectedPath(path);
      setPanelOpen(true);
    },
    [expandPath, setPanelOpen],
  );

  const loadFileContent = useCallback(
    async (path: string, options?: { background?: boolean }) => {
      const activeCwd = cwdRef.current.trim();
      if (!activeCwd) return;
      const normalizedPath = normalizeExplorerPath(path);
      const background = options?.background ?? false;

      if (
        isExplorerTreeDirectoryPath(treeRef.current, normalizedPath)
        || isExplorerTreeDirectoryPath(subprogramTreeRef.current, normalizedPath)
      ) {
        setTabs((prev) => {
          const tab = prev.find((t) => t.id === PREVIEW_TAB_ID);
          if (tab?.path !== normalizedPath) return prev;
          return [];
        });
        setActiveTabId((active) => (active === PREVIEW_TAB_ID ? null : active));
        return;
      }

      if (!background) {
        setTabs((prev) => {
          const tab = prev.find((t) => t.id === PREVIEW_TAB_ID);
          if (tab?.path !== normalizedPath || tab.content) return prev;
          return [{ ...tab, loading: true, error: undefined }];
        });
      }

      let result: Awaited<ReturnType<typeof fetchWorkspaceFile>>;
      try {
        result = await fetchWorkspaceFile(activeCwd, normalizedPath);
      } catch (error) {
        result = { ok: false, error: formatWorkspaceFetchError(error) };
      }
      if (!result.ok) {
        if (result.error.includes("not a file:")) {
          setTabs((prev) => {
            const tab = prev.find((t) => t.id === PREVIEW_TAB_ID);
            if (tab?.path !== normalizedPath) return prev;
            return [];
          });
          setActiveTabId((active) => (active === PREVIEW_TAB_ID ? null : active));
          return;
        }
        setTabs((prev) => {
          const tab = prev.find((t) => t.id === PREVIEW_TAB_ID);
          if (tab?.path !== normalizedPath) return prev;
          return [{ ...tab, loading: false, error: result.error }];
        });
        return;
      }

      writeFileCache(normalizedPath, {
        content: result.content,
        truncated: result.truncated,
        totalChars: result.totalChars,
      });

      setTabs((prev) => {
        const tab = prev.find((t) => t.id === PREVIEW_TAB_ID);
        if (tab?.path !== normalizedPath) return prev;
        if (
          tab.content === result.content
          && tab.truncated === result.truncated
          && tab.totalChars === result.totalChars
          && !tab.loading
          && !tab.error
        ) {
          return prev;
        }
        return [{
          ...tab,
          content: result.content,
          truncated: result.truncated,
          totalChars: result.totalChars,
          loading: false,
          error: undefined,
        }];
      });
    },
    [writeFileCache],
  );

  const openFile = useCallback(
    (
      path: string,
      content?: string,
      meta?: {
        truncated?: boolean;
        totalChars?: number;
        /** When false, do not force ancestor dirs open (e.g. action project row toggle). */
        revealInTree?: boolean;
        /** Titlebar tab label (defaults to file basename). */
        tabLabel?: string;
      },
    ) => {
      const normalizedPath = normalizeExplorerPath(path);
      const treeSnapshot = treeRef.current;
      const subprogramTreeSnapshot = subprogramTreeRef.current;
      const treeNode = treeSnapshot
        ? findExplorerTreeNode(treeSnapshot, normalizedPath)
        : null;
      const subprogramTreeNode = subprogramTreeSnapshot
        ? findExplorerTreeNode(subprogramTreeSnapshot, normalizedPath)
        : null;
      if (
        treeNode?.kind === "directory"
        || subprogramTreeNode?.kind === "directory"
        || isExplorerTreeDirectoryPath(treeSnapshot, normalizedPath)
        || isExplorerTreeDirectoryPath(subprogramTreeSnapshot, normalizedPath)
      ) {
        setPanelOpen(true);
        setSelectedPath(normalizedPath);
        setActiveSideView(SIDE_PANEL_VIEW_EXPLORER);
        return;
      }

      const cached = readFileCache(normalizedPath);
      const resolvedContent = content ?? cached?.content ?? "";
      const resolvedMeta = {
        truncated: meta?.truncated ?? cached?.truncated,
        totalChars: meta?.totalChars ?? cached?.totalChars,
      };

      if (content !== undefined) {
        writeFileCache(normalizedPath, {
          content,
          truncated: resolvedMeta.truncated,
          totalChars: resolvedMeta.totalChars,
        });
      }

      setPanelOpen(true);
      if (meta?.revealInTree !== false) {
        expandPath(normalizedPath);
      }
      setSelectedPath((prev) => (prev === normalizedPath ? prev : normalizedPath));
      setActiveSideView(SIDE_PANEL_PREVIEW_TAB_ID);
      setTabs((prev) => {
        const existing = prev.find((tab) => tab.id === PREVIEW_TAB_ID);
        if (
          existing?.path === normalizedPath
          && existing.content === resolvedContent
          && existing.truncated === resolvedMeta.truncated
          && existing.totalChars === resolvedMeta.totalChars
          && !existing.error
          && (content !== undefined || existing.content !== "" || existing.loading)
          && (!meta?.tabLabel || existing.label === meta.tabLabel)
        ) {
          return prev;
        }
        return [
          {
            id: PREVIEW_TAB_ID,
            path: normalizedPath,
            label: meta?.tabLabel ?? existing?.label,
            content: resolvedContent,
            truncated: resolvedMeta.truncated,
            totalChars: resolvedMeta.totalChars,
            loading: resolvedContent === "",
            error: undefined,
          },
        ];
      });
      setActiveTabId((prev) => (prev === PREVIEW_TAB_ID ? prev : PREVIEW_TAB_ID));

      clearWorkspaceMainEditorDoc();

      const needsFullReload =
        content === undefined
        || (resolvedMeta.truncated === true && isActionProjectDataPath(normalizedPath));
      if (needsFullReload) {
        void loadFileContent(normalizedPath, {
          background: resolvedContent !== "" && !resolvedMeta.truncated,
        });
      }
    },
    [expandPath, loadFileContent, readFileCache, setActiveSideView, setPanelOpen, writeFileCache],
  );

  const revealActionProjectByIdImpl = useCallback(
    (actionId: string): boolean => {
      const id = actionId.trim().toLowerCase();
      if (!id) return false;
      const treeSnapshot = treeRef.current;
      if (!treeSnapshot) return false;

      const project = treeSnapshot.children.find((node) => {
        const nodeId = node.actionId?.trim().toLowerCase();
        return nodeId === id || node.name.trim().toLowerCase() === id;
      });
      if (!project) return false;

      const dataPath = `${project.path.replace(/\\/g, "/")}/data.json`;
      const tabLabel = project.title?.trim() || project.name;
      openFile(dataPath, undefined, { tabLabel });
      return true;
    },
    [openFile],
  );

  const revealActionProjectById = useCallback(
    (actionId: string) => {
      void revealActionProjectByIdImpl(actionId);
    },
    [revealActionProjectByIdImpl],
  );

  const tryFlushPendingRevealActionProject = useCallback(() => {
    if (!pendingRevealActionId) return;
    if (revealActionProjectByIdImpl(pendingRevealActionId)) {
      pendingRevealActionId = null;
    }
  }, [revealActionProjectByIdImpl]);

  useEffect(() => {
    tryFlushPendingRevealRef.current = tryFlushPendingRevealActionProject;
  }, [tryFlushPendingRevealActionProject]);

  const openFileFromTool = useCallback(
    (toolName: string, input: unknown, output?: StructuredToolResult) => {
      if (!isWorkspaceExplorerFileTool(toolName)) return;

      const preview = getWorkspaceFileEditorPreview(
        toolName,
        input,
        output?.ok ? output.data : undefined,
      );
      if (!preview?.path) return;

      if (
        output?.ok
        && (toolName === "workspace_action_file_edit"
          || toolName === "workspace_action_edit_data"
          || isWorkspaceFileWriteTool(toolName))
      ) {
        openFile(preview.path);
        return;
      }

      const previewContent =
        preview.content !== undefined ? preview.content : undefined;

      openFile(preview.path, previewContent, {
        truncated: preview.truncated,
        totalChars: preview.totalChars,
      });
    },
    [openFile],
  );

  const saveWorkspaceFile = useCallback(
    async (path: string, content: string) => {
      const activeCwd = cwdRef.current.trim();
      if (!activeCwd) {
        return { ok: false as const, error: "未设置工作目录" };
      }
      const normalizedPath = path.replace(/\\/g, "/");
      const result = await writeWorkspaceFileApi(activeCwd, normalizedPath, content);
      if (!result.ok) {
        return { ok: false as const, error: result.error };
      }
      writeFileCache(normalizedPath, { content });
      setTabs((prev) => {
        const tab = prev.find((t) => t.id === PREVIEW_TAB_ID);
        if (tab?.path !== normalizedPath) return prev;
        if (tab.content === content && !tab.loading && !tab.error) return prev;
        return [{ ...tab, content, loading: false, error: undefined }];
      });
      return { ok: true as const };
    },
    [writeFileCache],
  );

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      if (!prev.some((tab) => tab.id === id)) return prev;
      return [];
    });
    setActiveTabId((active) => (active === id ? null : active));
    setActiveSideView(SIDE_PANEL_VIEW_EXPLORER);
    clearWorkspaceMainEditorDoc();
  }, [setActiveSideView]);

  const notifyProjectRemoved = useCallback(() => {
    closeTab(PREVIEW_TAB_ID);
    setSelectedPath(null);
    void refreshTree();
  }, [closeTab, refreshTree]);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [tabs, activeTabId],
  );

  const treeValue = useMemo(
    (): WorkspaceExplorerTreeContextValue => ({
      cwd,
      tree,
      subprogramTree,
      treeLoading,
      treeChildrenLoading,
      treeError,
      refreshTree,
      expandedPaths,
      toggleExpanded,
      expandPath,
      selectedPath,
      setSelectedPath,
    }),
    [
      cwd,
      tree,
      subprogramTree,
      treeLoading,
      treeChildrenLoading,
      treeError,
      refreshTree,
      expandedPaths,
      toggleExpanded,
      expandPath,
      selectedPath,
    ],
  );

  const editorValue = useMemo(
    (): WorkspaceExplorerEditorContextValue => ({
      cwd,
      tabs,
      activeTabId,
      activeTab,
      openFile,
      openFileFromTool,
      closeTab,
      setActiveTabId,
      loadFileContent,
      saveWorkspaceFile,
      revealPath,
      revealActionProjectById,
    }),
    [
      cwd,
      tabs,
      activeTabId,
      activeTab,
      openFile,
      openFileFromTool,
      closeTab,
      loadFileContent,
      saveWorkspaceFile,
      revealPath,
      revealActionProjectById,
    ],
  );

  const mergedValue = useMemo(
    (): WorkspaceExplorerContextValue => ({
      ...treeValue,
      ...editorValue,
      panelOpen,
      setPanelOpen,
      togglePanel,
    }),
    [treeValue, editorValue, panelOpen, setPanelOpen, togglePanel],
  );

  workspaceExplorerActionsRef.current = {
    openFile,
    openFileFromTool,
    revealPath,
    revealActionProjectById,
    setPanelOpen,
    refreshTree,
    notifyProjectRemoved,
    setActiveSideView,
    focusSidePanelView,
  };
  workspaceExplorerEditorStateRef.current = { activeTab, closeTab };

  return (
    <WorkspaceExplorerTreeContext.Provider value={treeValue}>
      <WorkspaceExplorerEditorContext.Provider value={editorValue}>
        <WorkspaceExplorerContext.Provider value={mergedValue}>
          {children}
        </WorkspaceExplorerContext.Provider>
      </WorkspaceExplorerEditorContext.Provider>
    </WorkspaceExplorerTreeContext.Provider>
  );
}

/** @deprecated Scope to the explorer panel only via WorkspaceExplorerPanelProvider. */
export const WorkspaceExplorerProvider = WorkspaceExplorerPanelProvider;

export function useWorkspaceExplorerTree(): WorkspaceExplorerTreeContextValue {
  const ctx = useContext(WorkspaceExplorerTreeContext);
  if (!ctx) {
    throw new Error(
      "useWorkspaceExplorerTree must be used within WorkspaceExplorerPanelProvider",
    );
  }
  return ctx;
}

export function useWorkspaceExplorerEditor(): WorkspaceExplorerEditorContextValue {
  const ctx = useContext(WorkspaceExplorerEditorContext);
  if (!ctx) {
    throw new Error(
      "useWorkspaceExplorerEditor must be used within WorkspaceExplorerPanelProvider",
    );
  }
  return ctx;
}

/** Full explorer state — prefer tree/editor hooks in panel UI to reduce re-renders. */
export function useWorkspaceExplorer(): WorkspaceExplorerContextValue {
  const ctx = useContext(WorkspaceExplorerContext);
  if (!ctx) {
    throw new Error(
      "useWorkspaceExplorer must be used within WorkspaceExplorerPanelProvider",
    );
  }
  return ctx;
}

/** Explorer callbacks; safe from chat — does not subscribe to tree context updates. */
export function useWorkspaceExplorerActions(): WorkspaceExplorerActions {
  return workspaceExplorerActionsRef.current;
}

export type { ExplorerTreeNode };
