"use client";

import { useEffect, useRef } from "react";
import {
  getActionTraceTabs,
  switchActionTraceThread,
} from "@/lib/action-trace-overlay";
import { useEmbeddedBrowser } from "@/lib/embedded-browser-context";
import { getThreadBrowserState } from "@/lib/thread-scoped-side-panel";
import { createThreadSidePanelSynchronizer } from "@/lib/thread-side-panel-sync";
import { useWorkspaceExplorerShell } from "@/lib/workspace-explorer";

/** Keep browser/trace side-panel state scoped per chat thread. */
export function useThreadSidePanelSync(activeThreadId: string): void {
  const { open: browserOpen } = useEmbeddedBrowser();
  const {
    activeSideView,
    setActiveSideView,
  } = useWorkspaceExplorerShell();
  const syncRef = useRef<ReturnType<typeof createThreadSidePanelSynchronizer> | null>(null);
  if (!syncRef.current) syncRef.current = createThreadSidePanelSynchronizer();

  useEffect(() => {
    syncRef.current?.({ threadId: activeThreadId, activeSideView }, {
      switchTraceThread: switchActionTraceThread,
      setActiveSideView,
      getTraceTabIds: () => getActionTraceTabs().map((tab) => tab.tabId),
      isBrowserOpen: (threadId) => getThreadBrowserState(threadId).open,
    });
  }, [
    activeSideView,
    activeThreadId,
    browserOpen,
    setActiveSideView,
  ]);
}

export function ThreadSidePanelSync({ activeThreadId }: { activeThreadId: string }) {
  useThreadSidePanelSync(activeThreadId);
  return null;
}
