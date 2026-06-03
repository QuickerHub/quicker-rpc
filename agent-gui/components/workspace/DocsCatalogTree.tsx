"use client";

import { useState } from "react";
import {
  ExplorerFileIcon,
  ExplorerFolderIcon,
  ExplorerTreeChevron,
} from "@/components/workspace/ExplorerTreeIcons";
import { useDocsViewer } from "@/lib/docs-viewer";
import { useWorkspaceExplorer } from "@/lib/workspace-explorer";

export function DocsCatalogTree() {
  const {
    catalogTopics,
    catalogLoading,
    catalogError,
    activeTopicId,
    selectTopic,
    refreshCatalog,
  } = useDocsViewer();
  const { setPanelOpen } = useWorkspaceExplorer();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="explorer-tree explorer-tree--docs">
      <button
        type="button"
        className="explorer-tree-row explorer-tree-row--root"
        onClick={() => setExpanded((value) => !value)}
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
                <span className="explorer-tree-label">
                  <span className="explorer-tree-name explorer-tree-name--title">
                    {topic.title}
                  </span>
                  {topic.description ? (
                    <span className="explorer-tree-sub">{topic.description}</span>
                  ) : (
                    <span className="explorer-tree-sub">{topic.topic}</span>
                  )}
                </span>
              </button>
            );
          })
        )
      ) : null}
    </div>
  );
}
