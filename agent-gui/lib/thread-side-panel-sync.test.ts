import assert from "node:assert/strict";
import test from "node:test";
import { createThreadSidePanelSynchronizer } from "./thread-side-panel-sync.ts";
import {
  getThreadScopedSideView,
  saveThreadScopedSideView,
} from "./thread-scoped-side-panel.ts";
import {
  SIDE_PANEL_VIEW_BROWSER,
  SIDE_PANEL_VIEW_EXPLORER,
} from "./workspace-side-panel-view.ts";

function fakeShell(browserThreads: string[], traces: Record<string, string[]>) {
  let activeThread = "";
  let view = SIDE_PANEL_VIEW_EXPLORER;
  let panelOpen = false;
  const switched: string[] = [];
  return {
    ports: {
      switchTraceThread: (threadId: string) => {
        activeThread = threadId;
        switched.push(threadId);
      },
      setActiveSideView: (next: string) => { view = next; },
      getTraceTabIds: () => traces[activeThread] ?? [],
      isBrowserOpen: (threadId: string) => browserThreads.includes(threadId),
    },
    switched,
    view: () => view,
    panelOpen: () => panelOpen,
    closePanel: () => { panelOpen = false; },
    openPanel: () => { panelOpen = true; },
  };
}

test("A trace to B browser and back preserves each thread's selected view", () => {
  const traceA = "__trace__:sync-a::";
  saveThreadScopedSideView("sync-a", traceA, false);
  saveThreadScopedSideView("sync-b", SIDE_PANEL_VIEW_BROWSER, true);
  const shell = fakeShell(["sync-b"], { "sync-a": [traceA] });
  const sync = createThreadSidePanelSynchronizer();

  sync({ threadId: "sync-a", activeSideView: SIDE_PANEL_VIEW_EXPLORER }, shell.ports);
  sync({ threadId: "sync-a", activeSideView: shell.view() }, shell.ports);
  sync({ threadId: "sync-b", activeSideView: traceA }, shell.ports);
  assert.equal(shell.view(), SIDE_PANEL_VIEW_BROWSER);
  sync({ threadId: "sync-b", activeSideView: shell.view() }, shell.ports);
  sync({ threadId: "sync-a", activeSideView: SIDE_PANEL_VIEW_BROWSER }, shell.ports);

  assert.equal(shell.view(), traceA);
  assert.equal(getThreadScopedSideView("sync-a").activeView, traceA);
  assert.equal(getThreadScopedSideView("sync-b").activeView, SIDE_PANEL_VIEW_BROWSER);
});

test("a repeated pre-commit effect cannot overwrite the restored thread", () => {
  const trace = "__trace__:replay-a::";
  saveThreadScopedSideView("replay-a", trace, false);
  saveThreadScopedSideView("replay-b", SIDE_PANEL_VIEW_BROWSER, true);
  const shell = fakeShell(["replay-b"], { "replay-a": [trace] });
  const sync = createThreadSidePanelSynchronizer();
  sync({ threadId: "replay-a", activeSideView: trace }, shell.ports);
  const pending = { threadId: "replay-b", activeSideView: trace };
  sync(pending, shell.ports);
  sync(pending, shell.ports);
  sync(pending, shell.ports);

  assert.equal(getThreadScopedSideView("replay-b").activeView, SIDE_PANEL_VIEW_BROWSER);
  assert.deepEqual(shell.switched, ["replay-a", "replay-b"]);
  sync({ threadId: "replay-b", activeSideView: SIDE_PANEL_VIEW_BROWSER }, shell.ports);
  sync({ threadId: "replay-b", activeSideView: SIDE_PANEL_VIEW_EXPLORER }, shell.ports);
  assert.equal(getThreadScopedSideView("replay-b").activeView, null);
});

test("restoring a selection keeps a closed panel closed and an open panel open", () => {
  saveThreadScopedSideView("closed-browser", SIDE_PANEL_VIEW_BROWSER, true);
  const shell = fakeShell(["closed-browser"], {});
  const sync = createThreadSidePanelSynchronizer();
  shell.closePanel();
  sync({ threadId: "closed-browser", activeSideView: SIDE_PANEL_VIEW_EXPLORER }, shell.ports);
  assert.equal(shell.view(), SIDE_PANEL_VIEW_BROWSER);
  assert.equal(shell.panelOpen(), false);

  shell.openPanel();
  sync({ threadId: "closed-browser", activeSideView: SIDE_PANEL_VIEW_BROWSER }, shell.ports);
  assert.equal(shell.panelOpen(), true);
});

test("an invalid trace falls back to the thread's remaining trace or shared explorer", () => {
  saveThreadScopedSideView("invalid-trace", "__trace__:removed::", false);
  saveThreadScopedSideView("no-traces", "__trace__:removed::", false);
  const fallback = "__trace__:remaining::";
  const shell = fakeShell([], { "invalid-trace": [fallback] });
  const sync = createThreadSidePanelSynchronizer();
  sync({ threadId: "invalid-trace", activeSideView: SIDE_PANEL_VIEW_EXPLORER }, shell.ports);
  assert.equal(shell.view(), fallback);
  assert.equal(getThreadScopedSideView("invalid-trace").activeView, fallback);

  sync({ threadId: "no-traces", activeSideView: fallback }, shell.ports);
  assert.equal(shell.view(), SIDE_PANEL_VIEW_EXPLORER);
  assert.equal(getThreadScopedSideView("no-traces").activeView, null);
});

test("closing a browser tab clears its remembered selection without changing other threads", () => {
  const browserThreads = ["closing-browser"];
  const otherTrace = "__trace__:unrelated-thread::";
  saveThreadScopedSideView("unrelated-thread", otherTrace, false);
  saveThreadScopedSideView("closing-browser", SIDE_PANEL_VIEW_BROWSER, true);
  const shell = fakeShell(browserThreads, {});
  const sync = createThreadSidePanelSynchronizer();
  sync({ threadId: "closing-browser", activeSideView: SIDE_PANEL_VIEW_BROWSER }, shell.ports);
  browserThreads.pop();
  sync({ threadId: "closing-browser", activeSideView: SIDE_PANEL_VIEW_BROWSER }, shell.ports);
  assert.equal(getThreadScopedSideView("closing-browser").activeView, null);
  assert.equal(getThreadScopedSideView("unrelated-thread").activeView, otherTrace);
});

test("a rapid return before restoration commits keeps both owners' remembered views", () => {
  const trace = "__trace__:rapid-a::";
  saveThreadScopedSideView("rapid-a", trace, false);
  saveThreadScopedSideView("rapid-b", SIDE_PANEL_VIEW_BROWSER, true);
  const shell = fakeShell(["rapid-b"], { "rapid-a": [trace] });
  const sync = createThreadSidePanelSynchronizer();
  sync({ threadId: "rapid-a", activeSideView: trace }, shell.ports);
  sync({ threadId: "rapid-b", activeSideView: trace }, shell.ports);
  sync({ threadId: "rapid-a", activeSideView: trace }, shell.ports);

  assert.equal(shell.view(), trace);
  assert.equal(getThreadScopedSideView("rapid-a").activeView, trace);
  assert.equal(getThreadScopedSideView("rapid-b").activeView, SIDE_PANEL_VIEW_BROWSER);
});
