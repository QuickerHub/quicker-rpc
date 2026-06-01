"use client";

import { useDocsViewer } from "@/lib/docs-viewer";
import { MarkdownMessage } from "./MarkdownMessage";

export function DocsViewerTabs() {
  const { tabs, activeTabId, setActiveTabId, closeTab } = useDocsViewer();

  if (tabs.length === 0) return null;

  return (
    <nav className="main-tabs" aria-label="文档">
      <button
        type="button"
        className={`main-tab${activeTabId === null ? " main-tab--active" : ""}`}
        onClick={() => setActiveTabId(null)}
      >
        对话
      </button>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`main-tab${activeTabId === tab.id ? " main-tab--active" : ""}`}
          onClick={() => setActiveTabId(tab.id)}
          title={tab.topic}
        >
          <span className="main-tab-label">{tab.title}</span>
          <span
            className="main-tab-close"
            role="button"
            tabIndex={0}
            aria-label={`关闭 ${tab.title}`}
            onClick={(event) => {
              event.stopPropagation();
              closeTab(tab.id);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                closeTab(tab.id);
              }
            }}
          >
            ×
          </span>
        </button>
      ))}
    </nav>
  );
}

export function DocsViewerPanel() {
  const { activeDoc } = useDocsViewer();

  if (!activeDoc) return null;

  return (
    <main className="docs-viewer-panel" aria-label={activeDoc.title}>
      <div className="docs-viewer-body">
        <MarkdownMessage content={activeDoc.markdown} variant="assistant" />
      </div>
    </main>
  );
}
