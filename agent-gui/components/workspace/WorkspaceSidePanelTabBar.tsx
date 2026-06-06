"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  SidePanelIconClose,
  SidePanelIconFile,
} from "@/components/workspace/side-panel-view-icons";
import { WorkspaceSidePanelHeaderControls } from "@/components/workspace/WorkspaceSidePanelHeaderControls";
import { WorkspaceSideViewTriggers } from "@/components/workspace/WorkspaceSideViewTriggers";
import { useDocsViewer } from "@/lib/docs-viewer";
import { useEmbeddedBrowser } from "@/lib/embedded-browser-context";
import { basenamePath } from "@/lib/workspace-file-tool";
import {
  useWorkspaceExplorerEditor,
  useWorkspaceExplorerShell,
} from "@/lib/workspace-explorer";
import {
  isSidePanelEditorView,
  SIDE_PANEL_PREVIEW_TAB_ID,
  SIDE_PANEL_VIEW_BROWSER,
  SIDE_PANEL_VIEW_EXPLORER,
} from "@/lib/workspace-side-panel-view";

type ContentTabItem = {
  id: string;
  label: string;
};

function tabLabel(path: string, label?: string): string {
  const custom = label?.trim();
  if (custom) return custom;
  return basenamePath(path) || path;
}

/** Open file tabs + contextual actions in the right split header. */
export function WorkspaceSidePanelTabBar() {
  const tabsRef = useRef<HTMLDivElement>(null);
  const { activeSideView, setActiveSideView, focusSidePanelView } =
    useWorkspaceExplorerShell();
  const { open: browserOpen } = useEmbeddedBrowser();
  const { tabs, activeTabId, setActiveTabId, closeTab } = useWorkspaceExplorerEditor();
  const { activeDoc, clearActiveTopic } = useDocsViewer();

  const tabItems = useMemo((): ContentTabItem[] => {
    const items: ContentTabItem[] = [];
    for (const tab of tabs) {
      items.push({
        id: tab.id,
        label: tabLabel(tab.path, tab.label),
      });
    }
    if (activeDoc && tabs.length === 0) {
      items.push({
        id: SIDE_PANEL_PREVIEW_TAB_ID,
        label: activeDoc.title,
      });
    }
    return items;
  }, [activeDoc, tabs]);

  const selectTab = useCallback(
    (tabId: string) => {
      if (!isSidePanelEditorView(tabId)) return;
      if (tabId === SIDE_PANEL_PREVIEW_TAB_ID && tabs.length === 0) {
        setActiveSideView(tabId);
        return;
      }
      setActiveTabId(tabId);
      setActiveSideView(tabId);
    },
    [setActiveSideView, setActiveTabId, tabs.length],
  );

  const closeTabItem = useCallback(
    (tabId: string) => {
      if (tabId === SIDE_PANEL_PREVIEW_TAB_ID && tabs.length === 0) {
        clearActiveTopic();
        setActiveSideView(SIDE_PANEL_VIEW_EXPLORER);
        return;
      }
      closeTab(tabId);
    },
    [clearActiveTopic, closeTab, setActiveSideView, tabs.length],
  );

  useEffect(() => {
    if (activeSideView === SIDE_PANEL_VIEW_EXPLORER) return;
    if (activeSideView === SIDE_PANEL_VIEW_BROWSER) return;
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
  ]);

  useEffect(() => {
    if (!browserOpen && activeSideView === SIDE_PANEL_VIEW_BROWSER) {
      setActiveSideView(SIDE_PANEL_VIEW_EXPLORER);
    }
  }, [activeSideView, browserOpen, setActiveSideView]);

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
          aria-label="打开的文件"
        >
          {tabItems.map((tab) => {
            const active = tab.id === activeSideView;
            return (
              <div
                key={tab.id}
                className={`workspace-side-panel-tab${active ? " workspace-side-panel-tab--active" : ""}`}
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
                    <SidePanelIconFile />
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
