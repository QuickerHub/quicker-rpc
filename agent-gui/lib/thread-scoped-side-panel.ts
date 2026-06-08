import type { BrowserPanelSnapshot } from "@/lib/browser-panel-types";
import { EMPTY_BROWSER_PANEL_SNAPSHOT } from "@/lib/browser-panel-types";
import {
  isSidePanelTraceView,
  SIDE_PANEL_VIEW_BROWSER,
  SIDE_PANEL_VIEW_EXPLORER,
} from "@/lib/workspace-side-panel-view";

export type ThreadBrowserState = {
  open: boolean;
  snapshot: BrowserPanelSnapshot;
  navigateSeq: number;
  navigateUrl: string | null;
};

export type ThreadScopedSideView = {
  /** Browser or trace tab id for this thread; null = explorer / shared view. */
  activeView: string | null;
};

export function isThreadScopedSideView(viewId: string): boolean {
  return viewId === SIDE_PANEL_VIEW_BROWSER || isSidePanelTraceView(viewId);
}

export function defaultThreadBrowserState(threadId: string): ThreadBrowserState {
  return {
    open: false,
    snapshot: {
      ...EMPTY_BROWSER_PANEL_SNAPSHOT,
      sessionId: threadId,
    },
    navigateSeq: 0,
    navigateUrl: null,
  };
}

const browserByThread = new Map<string, ThreadBrowserState>();
const scopedViewByThread = new Map<string, ThreadScopedSideView>();

export function getThreadBrowserState(threadId: string): ThreadBrowserState {
  const existing = browserByThread.get(threadId);
  if (existing) return existing;
  const created = defaultThreadBrowserState(threadId);
  browserByThread.set(threadId, created);
  return created;
}

export function saveThreadBrowserState(
  threadId: string,
  patch: Partial<ThreadBrowserState>,
): ThreadBrowserState {
  const prev = getThreadBrowserState(threadId);
  const next: ThreadBrowserState = {
    ...prev,
    ...patch,
    snapshot: patch.snapshot
      ? { ...prev.snapshot, ...patch.snapshot, sessionId: threadId }
      : { ...prev.snapshot, sessionId: threadId },
  };
  browserByThread.set(threadId, next);
  return next;
}

export function getThreadScopedSideView(threadId: string): ThreadScopedSideView {
  return scopedViewByThread.get(threadId) ?? { activeView: null };
}

export function saveThreadScopedSideView(
  threadId: string,
  activeSideView: string,
  browserOpen: boolean,
): void {
  let activeView: string | null = null;
  if (activeSideView === SIDE_PANEL_VIEW_BROWSER && browserOpen) {
    activeView = SIDE_PANEL_VIEW_BROWSER;
  } else if (isSidePanelTraceView(activeSideView)) {
    activeView = activeSideView;
  }
  scopedViewByThread.set(threadId, { activeView });
}

export type RestoreThreadSidePanelViewArgs = {
  threadId: string;
  currentSideView: string;
  setActiveSideView: (viewId: string) => void;
  focusSidePanelView: (viewId: string) => void;
  getTraceTabIds: () => string[];
  isBrowserOpen: (threadId: string) => boolean;
};

/** Restore browser/trace side view after switching threads; explorer stays shared. */
export function restoreThreadScopedSidePanelView(
  args: RestoreThreadSidePanelViewArgs,
): void {
  const saved = getThreadScopedSideView(args.threadId).activeView;
  const traceTabIds = new Set(args.getTraceTabIds());

  if (
    saved === SIDE_PANEL_VIEW_BROWSER
    && args.isBrowserOpen(args.threadId)
  ) {
    args.focusSidePanelView(SIDE_PANEL_VIEW_BROWSER);
    return;
  }

  if (saved && isSidePanelTraceView(saved)) {
    if (traceTabIds.has(saved)) {
      args.focusSidePanelView(saved);
      return;
    }
    const lastTrace = args.getTraceTabIds().at(-1);
    if (lastTrace) {
      args.focusSidePanelView(lastTrace);
      return;
    }
  }

  if (isThreadScopedSideView(args.currentSideView)) {
    args.setActiveSideView(SIDE_PANEL_VIEW_EXPLORER);
  }
}
