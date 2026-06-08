import assert from "node:assert/strict";
import test from "node:test";
import {
  getThreadBrowserState,
  getThreadScopedSideView,
  restoreThreadScopedSidePanelView,
  saveThreadBrowserState,
  saveThreadScopedSideView,
} from "@/lib/thread-scoped-side-panel";
import {
  SIDE_PANEL_VIEW_BROWSER,
  SIDE_PANEL_VIEW_EXPLORER,
} from "@/lib/workspace-side-panel-view";

test("thread browser state is isolated by thread id", () => {
  saveThreadBrowserState("thread-a", {
    open: true,
    snapshot: { url: "https://a.example" },
  });
  saveThreadBrowserState("thread-b", {
    open: false,
    snapshot: { url: "https://b.example" },
  });

  assert.equal(getThreadBrowserState("thread-a").snapshot.url, "https://a.example");
  assert.equal(getThreadBrowserState("thread-a").snapshot.sessionId, "thread-a");
  assert.equal(getThreadBrowserState("thread-b").snapshot.url, "https://b.example");
});

test("restoreThreadScopedSidePanelView focuses saved browser per thread", () => {
  saveThreadBrowserState("thread-a", { open: true });
  saveThreadScopedSideView("thread-a", SIDE_PANEL_VIEW_BROWSER, true);

  let active = SIDE_PANEL_VIEW_EXPLORER;
  restoreThreadScopedSidePanelView({
    threadId: "thread-a",
    currentSideView: SIDE_PANEL_VIEW_EXPLORER,
    setActiveSideView: (viewId) => {
      active = viewId;
    },
    focusSidePanelView: (viewId) => {
      active = viewId;
    },
    getTraceTabIds: () => [],
    isBrowserOpen: (threadId) => getThreadBrowserState(threadId).open,
  });

  assert.equal(active, SIDE_PANEL_VIEW_BROWSER);
  assert.equal(getThreadScopedSideView("thread-a").activeView, SIDE_PANEL_VIEW_BROWSER);
});
