export const EXPLORER_OPEN_STORAGE_KEY = "agent-gui-explorer-open";
export const EXPLORER_WIDTH_STORAGE_KEY = "agent-gui-explorer-width";
export const CHAT_COLUMN_WIDTH_STORAGE_KEY = "agent-gui-chat-column-width";
export const EXPLORER_TREE_SHARE_STORAGE_KEY = "agent-gui-explorer-tree-share";
export const EXPLORER_PANEL_VIEW_STORAGE_KEY = "agent-gui-explorer-panel-view";

export const EXPLORER_PANEL_VIEW_MAX_WORKSPACES = 24;

/** Previous defaults — migrate stored width so existing users get the narrower panel. */
const LEGACY_EXPLORER_DEFAULT_WIDTHS: number[] = [240, 180];

export const EXPLORER_DEFAULT_WIDTH = 140;
export const EXPLORER_MIN_WIDTH = 128;
export const EXPLORER_MAX_WIDTH = 720;

/** Tree : editor default height ratio = 1 : 2 → tree gets 1/3 of the split area. */
export const EXPLORER_DEFAULT_TREE_SHARE = 1 / 3;
export const EXPLORER_MIN_TREE_SHARE = 0.18;
export const EXPLORER_MAX_TREE_SHARE = 0.72;

export const CHAT_MAIN_MIN_WIDTH = 400;

export function maxExplorerWidthForLayout(
  shellWidth: number,
  sidebarWidthPx: number,
): number {
  const available = shellWidth - sidebarWidthPx - CHAT_MAIN_MIN_WIDTH;
  return clampExplorerWidth(Math.max(EXPLORER_MIN_WIDTH, available));
}

export function clampExplorerWidth(width: number): number {
  if (!Number.isFinite(width)) return EXPLORER_DEFAULT_WIDTH;
  return Math.round(
    Math.min(EXPLORER_MAX_WIDTH, Math.max(EXPLORER_MIN_WIDTH, width)),
  );
}

export function loadExplorerWidth(): number {
  if (typeof window === "undefined") return EXPLORER_DEFAULT_WIDTH;
  try {
    const raw = localStorage.getItem(EXPLORER_WIDTH_STORAGE_KEY);
    if (!raw) return EXPLORER_DEFAULT_WIDTH;
    const parsed = Number.parseInt(raw, 10);
    const width = clampExplorerWidth(parsed);
    if (LEGACY_EXPLORER_DEFAULT_WIDTHS.includes(width)) {
      return EXPLORER_DEFAULT_WIDTH;
    }
    return width;
  } catch {
    return EXPLORER_DEFAULT_WIDTH;
  }
}

export function storeExplorerWidth(width: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      EXPLORER_WIDTH_STORAGE_KEY,
      String(clampExplorerWidth(width)),
    );
  } catch {
    /* ignore */
  }
}

/** Pinned chat column width when the in-panel side split is open. */
export function clampChatColumnWidth(
  width: number,
  containerWidth: number,
): number {
  if (!Number.isFinite(width) || !Number.isFinite(containerWidth)) {
    return CHAT_MAIN_MIN_WIDTH;
  }
  const maxChat = Math.max(
    CHAT_MAIN_MIN_WIDTH,
    containerWidth - EXPLORER_MIN_WIDTH,
  );
  return Math.round(Math.min(maxChat, Math.max(CHAT_MAIN_MIN_WIDTH, width)));
}

export function defaultChatColumnWidth(containerWidth: number): number {
  return clampChatColumnWidth(Math.round(containerWidth / 2), containerWidth);
}

export function loadChatColumnWidth(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CHAT_COLUMN_WIDTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function storeChatColumnWidth(width: number, containerWidth: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      CHAT_COLUMN_WIDTH_STORAGE_KEY,
      String(clampChatColumnWidth(width, containerWidth)),
    );
  } catch {
    /* ignore */
  }
}

export function loadExplorerOpen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(EXPLORER_OPEN_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function storeExplorerOpen(open: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (open) {
      localStorage.setItem(EXPLORER_OPEN_STORAGE_KEY, "1");
    } else {
      localStorage.setItem(EXPLORER_OPEN_STORAGE_KEY, "0");
    }
  } catch {
    /* ignore */
  }
}

export function clampExplorerTreeShare(share: number): number {
  if (!Number.isFinite(share)) return EXPLORER_DEFAULT_TREE_SHARE;
  return Math.min(
    EXPLORER_MAX_TREE_SHARE,
    Math.max(EXPLORER_MIN_TREE_SHARE, share),
  );
}

export function loadExplorerTreeShare(): number {
  if (typeof window === "undefined") return EXPLORER_DEFAULT_TREE_SHARE;
  try {
    const raw = localStorage.getItem(EXPLORER_TREE_SHARE_STORAGE_KEY);
    if (!raw) return EXPLORER_DEFAULT_TREE_SHARE;
    const parsed = Number.parseFloat(raw);
    return clampExplorerTreeShare(parsed);
  } catch {
    return EXPLORER_DEFAULT_TREE_SHARE;
  }
}

export function storeExplorerTreeShare(share: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      EXPLORER_TREE_SHARE_STORAGE_KEY,
      String(clampExplorerTreeShare(share)),
    );
  } catch {
    /* ignore */
  }
}

export type ExplorerActionTreeViewState = {
  expandedPaths: string[];
  collapsedPaths: string[];
};

export type ExplorerPanelViewState = {
  actionTree: ExplorerActionTreeViewState;
  docsExpanded: boolean;
};

type StoredExplorerPanelViews = {
  v: 1;
  workspaces: Record<
    string,
    ExplorerPanelViewState & {
      lastUsed: number;
    }
  >;
};

export function normalizeExplorerWorkspaceKey(cwd: string): string {
  return cwd.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function readStoredExplorerPanelViews(): StoredExplorerPanelViews {
  if (typeof window === "undefined") {
    return { v: 1, workspaces: {} };
  }
  try {
    const raw = localStorage.getItem(EXPLORER_PANEL_VIEW_STORAGE_KEY);
    if (!raw) return { v: 1, workspaces: {} };
    const parsed = JSON.parse(raw) as Partial<StoredExplorerPanelViews>;
    if (parsed.v !== 1 || !parsed.workspaces || typeof parsed.workspaces !== "object") {
      return { v: 1, workspaces: {} };
    }
    return { v: 1, workspaces: parsed.workspaces };
  } catch {
    return { v: 1, workspaces: {} };
  }
}

function writeStoredExplorerPanelViews(data: StoredExplorerPanelViews): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(EXPLORER_PANEL_VIEW_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function pruneExplorerPanelViewWorkspaces(
  workspaces: StoredExplorerPanelViews["workspaces"],
): StoredExplorerPanelViews["workspaces"] {
  const entries = Object.entries(workspaces);
  if (entries.length <= EXPLORER_PANEL_VIEW_MAX_WORKSPACES) {
    return workspaces;
  }
  entries.sort((a, b) => (b[1].lastUsed ?? 0) - (a[1].lastUsed ?? 0));
  return Object.fromEntries(entries.slice(0, EXPLORER_PANEL_VIEW_MAX_WORKSPACES));
}

function normalizeExplorerTreeViewPaths(paths: string[] | undefined): string[] {
  if (!Array.isArray(paths)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const path of paths) {
    if (typeof path !== "string") continue;
    const key = path.trim().replace(/\\/g, "/").replace(/\/+$/, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
  }
  return normalized;
}

/** Load persisted explorer panel view for a workspace cwd, or null when never saved. */
export function loadExplorerPanelView(cwd: string): ExplorerPanelViewState | null {
  const key = normalizeExplorerWorkspaceKey(cwd);
  if (!key) return null;
  const stored = readStoredExplorerPanelViews();
  const entry = stored.workspaces[key];
  if (!entry) return null;
  return {
    actionTree: {
      expandedPaths: normalizeExplorerTreeViewPaths(entry.actionTree?.expandedPaths),
      collapsedPaths: normalizeExplorerTreeViewPaths(entry.actionTree?.collapsedPaths),
    },
    docsExpanded: entry.docsExpanded === true,
  };
}

/** Merge and persist explorer panel view for a workspace cwd. */
export function storeExplorerPanelView(
  cwd: string,
  patch: Partial<ExplorerPanelViewState>,
): void {
  const key = normalizeExplorerWorkspaceKey(cwd);
  if (!key) return;

  const stored = readStoredExplorerPanelViews();
  const previous = stored.workspaces[key];
  const nextEntry: ExplorerPanelViewState & { lastUsed: number } = {
    actionTree: {
      expandedPaths: normalizeExplorerTreeViewPaths(
        patch.actionTree?.expandedPaths ?? previous?.actionTree.expandedPaths,
      ),
      collapsedPaths: normalizeExplorerTreeViewPaths(
        patch.actionTree?.collapsedPaths ?? previous?.actionTree.collapsedPaths,
      ),
    },
    docsExpanded: patch.docsExpanded ?? previous?.docsExpanded ?? false,
    lastUsed: Date.now(),
  };

  stored.workspaces[key] = nextEntry;
  stored.workspaces = pruneExplorerPanelViewWorkspaces(stored.workspaces);
  writeStoredExplorerPanelViews(stored);
}
