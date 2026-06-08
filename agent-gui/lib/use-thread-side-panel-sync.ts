"use client";

import { useEffect, useRef } from "react";
import {
  getActionTraceTabs,
  switchActionTraceThread,
} from "@/lib/action-trace-overlay";
import { useEmbeddedBrowser } from "@/lib/embedded-browser-context";
import {
  getThreadBrowserState,
  restoreThreadScopedSidePanelView,
  saveThreadScopedSideView,
} from "@/lib/thread-scoped-side-panel";
import { useWorkspaceExplorerShell } from "@/lib/workspace-explorer";

/** Keep browser/trace side-panel state scoped per chat thread. */
export function useThreadSidePanelSync(activeThreadId: string): void {
  const { open: browserOpen } = useEmbeddedBrowser();
  const {
    activeSideView,
    setActiveSideView,
    focusSidePanelView,
  } = useWorkspaceExplorerShell();
  const prevThreadRef = useRef<string | null>(null);

  useEffect(() => {
    saveThreadScopedSideView(activeThreadId, activeSideView, browserOpen);
  }, [activeSideView, activeThreadId, browserOpen]);

  useEffect(() => {
    const prev = prevThreadRef.current;
    if (prev === activeThreadId) return;

    if (prev) {
      saveThreadScopedSideView(prev, activeSideView, browserOpen);
    }

    switchActionTraceThread(activeThreadId);
    restoreThreadScopedSidePanelView({
      threadId: activeThreadId,
      currentSideView: activeSideView,
      setActiveSideView,
      focusSidePanelView,
      getTraceTabIds: () => getActionTraceTabs().map((tab) => tab.tabId),
      isBrowserOpen: (threadId) => getThreadBrowserState(threadId).open,
    });

    prevThreadRef.current = activeThreadId;
  }, [
    activeSideView,
    activeThreadId,
    browserOpen,
    focusSidePanelView,
    setActiveSideView,
  ]);
}

export function ThreadSidePanelSync({ activeThreadId }: { activeThreadId: string }) {
  useThreadSidePanelSync(activeThreadId);
  return null;
}
