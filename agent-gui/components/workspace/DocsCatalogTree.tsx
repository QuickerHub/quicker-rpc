"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ExplorerFileIcon,
  ExplorerFolderIcon,
  ExplorerTreeChevron,
} from "@/components/workspace/ExplorerTreeIcons";
import { docViewerEntryKey } from "@/lib/action-authoring-docs.shared";
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
    selectReference,
    refreshCatalog,
  } = useDocsViewer();
  const { cwd } = useWorkspaceExplorerTree();
  const { setPanelOpen } = useWorkspaceExplorerShell();
  const [expanded, setExpanded] = useState(false);
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>(
    {},
  );

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

  const toggleTopicExpanded = useCallback((topicId: string) => {
    setExpandedTopics((prev) => ({
      ...prev,
      [topicId]: !prev[topicId],
    }));
  }, []);

  const refCount = catalogTopics.reduce(
    (n, t) => n + (t.references?.length ?? 0),
    0,
  );

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
          {catalogLoading
            ? "…"
            : `${catalogTopics.length}${refCount > 0 ? `+${refCount}` : ""}`}
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
            const refs = topic.references ?? [];
            const hasRefs = refs.length > 0;
            const topicExpanded = expandedTopics[topic.topic] ?? false;
            const topicEntryKey = docViewerEntryKey(topic.topic);
            const topicSelected = activeTopicId === topicEntryKey;

            return (
              <div key={topic.topic} className="explorer-tree-group">
                <div className="explorer-tree-row-wrap">
                  {hasRefs ? (
                    <button
                      type="button"
                      className="explorer-tree-chevron-btn"
                      aria-label={topicExpanded ? "收起" : "展开"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTopicExpanded(topic.topic);
                      }}
                    >
                      <ExplorerTreeChevron expanded={topicExpanded} />
                    </button>
                  ) : (
                    <ExplorerTreeChevron hidden />
                  )}
                  <button
                    type="button"
                    className={`explorer-tree-row explorer-tree-row--topic${topicSelected ? " explorer-tree-row--selected" : ""}`}
                    style={{ paddingLeft: hasRefs ? "0.35rem" : "1.3rem" }}
                    onClick={() => {
                      selectTopic(topic.topic, topic.title);
                      setPanelOpen(true);
                      if (hasRefs) {
                        setExpandedTopics((prev) => ({
                          ...prev,
                          [topic.topic]: true,
                        }));
                      }
                    }}
                    title={
                      topic.description
                        ? `${topic.title}\n${topic.description}\n${topic.topic}`
                        : `${topic.title}\n${topic.topic}`
                    }
                  >
                    <span className="explorer-tree-icon explorer-tree-icon--file">
                      {hasRefs ? (
                        <ExplorerFolderIcon expanded={topicExpanded} />
                      ) : (
                        <ExplorerFileIcon name={`${topic.topic}.md`} />
                      )}
                    </span>
                    <span className="explorer-tree-name explorer-tree-name--title">
                      {topic.title}
                    </span>
                  </button>
                </div>
                {hasRefs && topicExpanded
                  ? refs.map((ref) => {
                      const refEntryKey = docViewerEntryKey(
                        topic.topic,
                        ref.id,
                      );
                      const refSelected = activeTopicId === refEntryKey;
                      return (
                        <button
                          key={ref.id}
                          type="button"
                          className={`explorer-tree-row${refSelected ? " explorer-tree-row--selected" : ""}`}
                          style={{ paddingLeft: "2.1rem" }}
                          onClick={() => {
                            selectReference(topic.topic, ref.id, ref.title);
                            setPanelOpen(true);
                          }}
                          title={`${ref.title}\n${topic.topic}/${ref.id}`}
                        >
                          <ExplorerTreeChevron hidden />
                          <span className="explorer-tree-icon explorer-tree-icon--file">
                            <ExplorerFileIcon name={`${ref.id}.md`} />
                          </span>
                          <span className="explorer-tree-name explorer-tree-name--title">
                            {ref.title}
                          </span>
                        </button>
                      );
                    })
                  : null}
              </div>
            );
          })
        )
      ) : null}
    </div>
  );
}
