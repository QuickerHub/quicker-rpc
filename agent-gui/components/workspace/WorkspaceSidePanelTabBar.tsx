"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  SidePanelIconBrowser,
  SidePanelIconClose,
  SidePanelIconFile,
  SidePanelIconTerminal,
  SidePanelIconTrace,
} from "@/components/workspace/side-panel-view-icons";
import { WorkspaceSidePanelHeaderControls } from "@/components/workspace/WorkspaceSidePanelHeaderControls";
import { WorkspaceSideViewTriggers } from "@/components/workspace/WorkspaceSideViewTriggers";
import {
  closeActionTraceTab,
  getActionTraceTabBarLabel,
  useActionTraceTabs,
} from "@/lib/action-trace-overlay";
import { isSidePanelTraceView } from "@/lib/action-trace-tab-id";
import { useDocsViewer } from "@/lib/docs-viewer";
import { useEmbeddedBrowser } from "@/lib/embedded-browser-context";
import { useEmbeddedTerminal } from "@/lib/embedded-terminal-context";
import { useEmbeddedBrowserTabs } from "@/lib/embedded-browser-tabs";
import {
  DEFAULT_EMBEDDED_BROWSER_ID,
  embeddedBrowserClose,
} from "@/lib/embedded-browser-tauri";
import { basenamePath } from "@/lib/workspace-file-tool";
import {
  useWorkspaceExplorerEditor,
  useWorkspaceExplorerShell,
} from "@/lib/workspace-explorer";
import {
  browserIdFromSideView,
  isSidePanelBrowserView,
  isSidePanelEditorView,
  isSidePanelTerminalView,
  SIDE_PANEL_PREVIEW_TAB_ID,
  SIDE_PANEL_VIEW_BROWSER,
  SIDE_PANEL_VIEW_EXPLORER,
  SIDE_PANEL_VIEW_TERMINAL,
  sidePanelBrowserViewId,
} from "@/lib/workspace-side-panel-view";

type ContentTabItem = {
  id: string;
  label: string;
  kind: "file" | "trace" | "browser" | "terminal";
};

function tabLabel(
  path: string,
  label?: string,
  kind?: "file" | "diff",
): string {
  const custom = label?.trim();
  const base = custom || basenamePath(path) || path;
  return kind === "diff" ? `Δ ${base}` : base;
}

/** Open file + trace tabs in the right split header. */
export function WorkspaceSidePanelTabBar() {
  const tabsRef = useRef<HTMLDivElement>(null);
  const { activeSideView, setActiveSideView, focusSidePanelView } =
    useWorkspaceExplorerShell();
  const {
    open: browserOpen,
    snapshot: browserSnapshot,
    setOpen: setBrowserOpen,
  } = useEmbeddedBrowser();
  const { open: terminalOpen, setOpen: setTerminalOpen } = useEmbeddedTerminal();
  const { tabs: browserTabs, closeTab: closeBrowserTab } =
    useEmbeddedBrowserTabs();
  const { tabs, activeTabId, setActiveTabId, closeTab } = useWorkspaceExplorerEditor();
  const { activeDoc, clearActiveTopic } = useDocsViewer();
  const traceTabs = useActionTraceTabs();

  const tabItems = useMemo((): ContentTabItem[] => {
    const items: ContentTabItem[] = [];
    for (const tab of tabs) {
      items.push({
        id: tab.id,
        label: tabLabel(tab.path, tab.label, tab.kind),
        kind: "file",
      });
    }
    if (activeDoc && tabs.length === 0) {
      items.push({
        id: SIDE_PANEL_PREVIEW_TAB_ID,
        label: activeDoc.title,
        kind: "file",
      });
    }
    if (browserOpen) {
      items.push({
        id: SIDE_PANEL_VIEW_BROWSER,
        label:
          browserSnapshot.title?.trim()
          || browserSnapshot.url?.trim()
          || "浏览器",
        kind: "browser",
      });
    }
    if (terminalOpen) {
      items.push({
        id: SIDE_PANEL_VIEW_TERMINAL,
        label: "终端",
        kind: "terminal",
      });
    }
    for (const browserTab of browserTabs) {
      items.push({
        id: sidePanelBrowserViewId(browserTab.id),
        label: browserTab.title?.trim() || browserTab.url?.trim() || "新标签页",
        kind: "browser",
      });
    }
    for (const traceTab of traceTabs) {
      items.push({
        id: traceTab.tabId,
        label: getActionTraceTabBarLabel(traceTab),
        kind: "trace",
      });
    }
    return items;
  }, [
    activeDoc,
    browserOpen,
    browserSnapshot.title,
    browserSnapshot.url,
    browserTabs,
    terminalOpen,
    tabs,
    traceTabs,
  ]);

  const selectTab = useCallback(
    (tabId: string) => {
      if (
        isSidePanelTraceView(tabId)
        || isSidePanelBrowserView(tabId)
        || isSidePanelTerminalView(tabId)
      ) {
        focusSidePanelView(tabId);
        return;
      }
      if (!isSidePanelEditorView(tabId)) return;
      if (tabId === SIDE_PANEL_PREVIEW_TAB_ID && tabs.length === 0) {
        setActiveSideView(tabId);
        return;
      }
      setActiveTabId(tabId);
      setActiveSideView(tabId);
    },
    [focusSidePanelView, setActiveSideView, setActiveTabId, tabs.length],
  );

  const closeTabItem = useCallback(
    (tabId: string) => {
      if (tabId === SIDE_PANEL_VIEW_TERMINAL) {
        setTerminalOpen(false);
        if (activeSideView === SIDE_PANEL_VIEW_TERMINAL) {
          setActiveSideView(SIDE_PANEL_VIEW_EXPLORER);
        }
        return;
      }
      if (isSidePanelBrowserView(tabId)) {
        const browserId = browserIdFromSideView(tabId);
        if (browserId === DEFAULT_EMBEDDED_BROWSER_ID) {
          setBrowserOpen(false);
          void embeddedBrowserClose(DEFAULT_EMBEDDED_BROWSER_ID).catch(() => {});
        } else if (browserId) {
          closeBrowserTab(browserId);
          if (tabId === activeSideView) {
            setActiveSideView(SIDE_PANEL_VIEW_EXPLORER);
          }
        }
        return;
      }
      if (isSidePanelTraceView(tabId) && tabId !== SIDE_PANEL_PREVIEW_TAB_ID) {
        closeActionTraceTab(tabId, { wasActive: tabId === activeSideView });
        return;
      }
      if (tabId === SIDE_PANEL_PREVIEW_TAB_ID && tabs.length === 0) {
        clearActiveTopic();
        setActiveSideView(SIDE_PANEL_VIEW_EXPLORER);
        return;
      }
      closeTab(tabId);
    },
    [
      activeSideView,
      clearActiveTopic,
      closeBrowserTab,
      closeTab,
      setActiveSideView,
      setBrowserOpen,
      setTerminalOpen,
      tabs.length,
    ],
  );

  useEffect(() => {
    if (activeSideView === SIDE_PANEL_VIEW_EXPLORER) return;
    if (activeSideView === SIDE_PANEL_VIEW_BROWSER) return;
    if (activeSideView === SIDE_PANEL_VIEW_TERMINAL) return;
    if (isSidePanelTraceView(activeSideView)) {
      if (traceTabs.some((tab) => tab.tabId === activeSideView)) return;
      if (traceTabs.length > 0) {
        focusSidePanelView(traceTabs[traceTabs.length - 1]!.tabId);
        return;
      }
    }
    if (tabItems.some((tab) => tab.id === activeSideView)) return;

    if (browserOpen && activeSideView !== SIDE_PANEL_VIEW_BROWSER) {
      focusSidePanelView(SIDE_PANEL_VIEW_BROWSER);
      return;
    }
    if (activeTabId && tabItems.some((tab) => tab.id === activeTabId)) {
      setActiveSideView(activeTabId);
      return;
    }
    if (activeDoc && tabs.length === 0) {
      setActiveSideView(SIDE_PANEL_PREVIEW_TAB_ID);
      return;
    }
    if (traceTabs.length > 0) {
      focusSidePanelView(traceTabs[traceTabs.length - 1]!.tabId);
      return;
    }
    if (browserOpen) {
      setActiveSideView(SIDE_PANEL_VIEW_BROWSER);
      return;
    }
    setActiveSideView(SIDE_PANEL_VIEW_EXPLORER);
  }, [
    activeDoc,
    activeSideView,
    activeTabId,
    browserOpen,
    focusSidePanelView,
    setActiveSideView,
    tabItems,
    tabs.length,
    traceTabs,
  ]);

  useEffect(() => {
    if (!browserOpen && activeSideView === SIDE_PANEL_VIEW_BROWSER) {
      setActiveSideView(SIDE_PANEL_VIEW_EXPLORER);
    }
  }, [activeSideView, browserOpen, setActiveSideView]);

  useEffect(() => {
    if (!terminalOpen && activeSideView === SIDE_PANEL_VIEW_TERMINAL) {
      setActiveSideView(SIDE_PANEL_VIEW_EXPLORER);
    }
  }, [activeSideView, setActiveSideView, terminalOpen]);

  useEffect(() => {
    const root = tabsRef.current;
    if (!root) return;

    const onWheel = (e: WheelEvent) => {
      if (root.scrollWidth <= root.clientWidth) return;
      const delta =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      e.preventDefault();
      root.scrollLeft += delta;
    };

    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [tabItems.length]);

  useEffect(() => {
    const root = tabsRef.current;
    if (!root) return;
    const active = root.querySelector<HTMLElement>('[data-active="true"]');
    if (!active) return;
    active.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeSideView, tabItems.length]);

  const hasContentTabs = tabItems.length > 0;

  return (
    <div className="workspace-side-panel-head workspace-side-panel-head--inline">
      <WorkspaceSideViewTriggers />
      {hasContentTabs ? (
        <div
          className="workspace-side-panel-tabs"
          ref={tabsRef}
          role="tablist"
          aria-label="侧栏标签"
        >
          {tabItems.map((tab) => {
            const active = tab.id === activeSideView;
            return (
              <div
                key={tab.id}
                className={`workspace-side-panel-tab${active ? " workspace-side-panel-tab--active" : ""}${tab.kind === "trace" ? " workspace-side-panel-tab--trace" : ""}`}
                data-active={active ? "true" : undefined}
              >
                <button
                  type="button"
                  role="tab"
                  className="workspace-side-panel-tab-main"
                  aria-selected={active}
                  title={tab.label}
                  onClick={() => selectTab(tab.id)}
                >
                  <span className="workspace-side-panel-tab-icon">
                    {tab.kind === "trace" ? (
                      <SidePanelIconTrace />
                    ) : tab.kind === "browser" ? (
                      <SidePanelIconBrowser />
                    ) : tab.kind === "terminal" ? (
                      <SidePanelIconTerminal />
                    ) : (
                      <SidePanelIconFile />
                    )}
                  </span>
                  <span className="workspace-side-panel-tab-label">{tab.label}</span>
                </button>
                <button
                  type="button"
                  className="workspace-side-panel-tab-close"
                  aria-label={`关闭 ${tab.label}`}
                  title="关闭"
                  onClick={(event) => {
                    event.stopPropagation();
                    closeTabItem(tab.id);
                  }}
                >
                  <SidePanelIconClose />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="workspace-side-panel-head-spacer" aria-hidden />
      <WorkspaceSidePanelHeaderControls />
    </div>
  );
}
