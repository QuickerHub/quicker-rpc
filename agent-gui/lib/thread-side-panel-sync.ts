import {
  restoreThreadScopedSidePanelView,
  saveThreadScopedSideView,
} from "./thread-scoped-side-panel";

type ThreadSidePanelSnapshot = {
  threadId: string;
  activeSideView: string;
};

type ThreadSidePanelSyncPorts = {
  switchTraceThread: (threadId: string) => void;
  setActiveSideView: (viewId: string) => void;
  getTraceTabIds: () => string[];
  isBrowserOpen: (threadId: string) => boolean;
};

/** One owner transition per thread switch, independent of React effect replay. */
export function createThreadSidePanelSynchronizer() {
  let owner: ThreadSidePanelSnapshot | null = null;
  let pendingRestore: { previousView: string; restoredView: string } | null = null;

  return (snapshot: ThreadSidePanelSnapshot, ports: ThreadSidePanelSyncPorts): void => {
    if (owner?.threadId !== snapshot.threadId) {
      if (owner) {
        saveThreadScopedSideView(
          owner.threadId,
          owner.activeSideView,
          ports.isBrowserOpen(owner.threadId),
        );
      }

      ports.switchTraceThread(snapshot.threadId);
      const restoredView = restoreThreadScopedSidePanelView({
        threadId: snapshot.threadId,
        currentSideView: snapshot.activeSideView,
        setActiveSideView: ports.setActiveSideView,
        // Selection restoration must not reopen a panel the user closed.
        focusSidePanelView: ports.setActiveSideView,
        getTraceTabIds: ports.getTraceTabIds,
        isBrowserOpen: ports.isBrowserOpen,
      });
      owner = { threadId: snapshot.threadId, activeSideView: restoredView };
      pendingRestore = restoredView === snapshot.activeSideView ? null : {
        previousView: snapshot.activeSideView,
        restoredView,
      };
      saveThreadScopedSideView(
        owner.threadId,
        owner.activeSideView,
        ports.isBrowserOpen(owner.threadId),
      );
      return;
    }

    // StrictMode or another context may replay the pre-restoration view before
    // the requested selection commits. It still belongs to the previous owner.
    if (pendingRestore
      && snapshot.activeSideView === pendingRestore.previousView
      && snapshot.activeSideView !== pendingRestore.restoredView) return;

    pendingRestore = null;
    owner = snapshot;
    saveThreadScopedSideView(
      snapshot.threadId,
      snapshot.activeSideView,
      ports.isBrowserOpen(snapshot.threadId),
    );
  };
}
