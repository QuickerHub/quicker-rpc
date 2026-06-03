"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ExplorerFileIcon,
  ExplorerFolderIcon,
  ExplorerTreeChevron,
} from "@/components/workspace/ExplorerTreeIcons";
import { loadExplorerPanelView, storeExplorerPanelView } from "@/lib/explorer-prefs";
import { useDocsViewer } from "@/lib/docs-viewer";
import {
  useWorkspaceExplorerShell,
  useWorkspaceExplorerTree,
} from "@/lib/workspace-explorer";

export function DocsCatalogTree() {
  const {
    catalogTopics,
    catalogLoading,
    catalogError,
    activeTopicId,
    selectTopic,
    refreshCatalog,
  } = useDocsViewer();
  const { cwd } = useWorkspaceExplorerTree();
  const { setPanelOpen } = useWorkspaceExplorerShell();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const trimmed = cwd.trim();
    if (!trimmed) return;
    const saved = loadExplorerPanelView(trimmed);
    setExpanded(saved?.docsExpanded ?? false);
  }, [cwd]);

  const toggleExpanded = useCallback(() => {
    setExpanded((value) => {
      const next = !value;
      const trimmed = cwd.trim();
      if (trimmed) {
        storeExplorerPanelView(trimmed, { docsExpanded: next });
      }
      return next;
    });
  }, [cwd]);

  return (
    <div className="explorer-tree explorer-tree--docs">
      <button
        type="button"
        className="explorer-tree-row explorer-tree-row--root"
        onClick={toggleExpanded}
      >
        <ExplorerTreeChevron expanded={expanded} />
        <span className="explorer-tree-icon explorer-tree-icon--dir">
          <ExplorerFolderIcon expanded={expanded} />
        </span>
        <span className="explorer-tree-name">文档</span>
        <span className="explorer-tree-meta">
          {catalogLoading ? "…" : `${catalogTopics.length} 项`}
        </span>
      </button>
      {expanded ? (
        catalogLoading && catalogTopics.length === 0 ? (
          <p className="workspace-explorer-hint workspace-explorer-hint--nested">
            加载中…
          </p>
        ) : catalogError ? (
          <div className="workspace-explorer-hint workspace-explorer-hint--nested">
            <p className="workspace-explorer-hint--err">{catalogError}</p>
            <button
              type="button"
              className="workspace-explorer-inline-btn"
              onClick={() => void refreshCatalog()}
            >
              重试
            </button>
          </div>
        ) : (
          catalogTopics.map((topic) => {
            const selected = activeTopicId === topic.topic;
            return (
              <button
                key={topic.topic}
                type="button"
                className={`explorer-tree-row${selected ? " explorer-tree-row--selected" : ""}`}
                style={{ paddingLeft: "1.3rem" }}
                onClick={() => {
                  selectTopic(topic.topic, topic.title);
                  setPanelOpen(true);
                }}
                title={
                  topic.description
                    ? `${topic.title}\n${topic.description}\n${topic.topic}`
                    : `${topic.title}\n${topic.topic}`
                }
              >
                <ExplorerTreeChevron hidden />
                <span className="explorer-tree-icon explorer-tree-icon--file">
                  <ExplorerFileIcon name={`${topic.topic}.md`} />
                </span>
                <span className="explorer-tree-name explorer-tree-name--title">
                  {topic.title}
                </span>
              </button>
            );
          })
        )
      ) : null}
    </div>
  );
}
