"use client";

import { useEffect, useRef } from "react";
import { basenamePath } from "@/lib/workspace-file-tool";
import { useWorkspaceExplorerEditor } from "@/lib/workspace-explorer";

function tabLabel(path: string, label?: string): string {
  const custom = label?.trim();
  if (custom) return custom;
  return basenamePath(path) || path;
}

function IconFileTab() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M4 2.25h4.2L11 5.05v6.2a.75.75 0 0 1-.75.75H3.75A.75.75 0 0 1 3 11.25V3A.75.75 0 0 1 3.75 2.25H4Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M7.75 2.5V5H10.5" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M3 3l6 6M9 3L3 9"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function WorkspaceExplorerFileTabs() {
  const tabsRef = useRef<HTMLDivElement>(null);
  const { tabs, activeTabId, setActiveTabId, closeTab } = useWorkspaceExplorerEditor();

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
  }, [tabs.length]);

  useEffect(() => {
    const root = tabsRef.current;
    if (!root || !activeTabId) return;
    const active = root.querySelector<HTMLElement>('[data-active="true"]');
    if (!active) return;
    const tabIndex = tabs.findIndex((t) => t.id === activeTabId);
    const isLast = tabIndex === tabs.length - 1;
    const isFirst = tabIndex === 0;
    active.scrollIntoView({
      block: "nearest",
      inline: isLast ? "end" : isFirst ? "start" : "nearest",
    });
  }, [activeTabId, tabs.length]);

  if (tabs.length === 0) return null;

  return (
    <div
      className="titlebar-tabs titlebar-tabs--explorer"
      ref={tabsRef}
      role="tablist"
      aria-label="工作区文件"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        const name = tabLabel(tab.path, tab.label);
        return (
          <div
            key={tab.id}
            className={`titlebar-tab${active ? " titlebar-tab--active" : ""}`}
            data-active={active ? "true" : undefined}
          >
            <button
              type="button"
              role="tab"
              className="titlebar-tab-main"
              aria-selected={active}
              title={tab.path}
              onClick={() => setActiveTabId(tab.id)}
            >
              <span className="titlebar-tab-icon">
                <IconFileTab />
              </span>
              <span className="titlebar-tab-label">{name}</span>
            </button>
            <button
              type="button"
              className="titlebar-tab-close"
              aria-label={`关闭 ${name}`}
              title="关闭"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
            >
              <IconClose />
            </button>
          </div>
        );
      })}
    </div>
  );
}
