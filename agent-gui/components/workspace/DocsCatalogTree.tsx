"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ExplorerFileIcon,
  ExplorerFolderIcon,
  ExplorerTreeChevron,
} from "@/components/workspace/ExplorerTreeIcons";
import {
  docViewerEntryKey,
  groupTopicsByLayer,
} from "@/lib/action-authoring-docs.shared";
import { loadExplorerPanelView, storeExplorerPanelView } from "@/lib/explorer-prefs";
import { useDocsViewer } from "@/lib/docs-viewer";
import {
  useWorkspaceExplorerShell,
  useWorkspaceExplorerTree,
} from "@/lib/workspace-explorer";
import type { ActionAuthoringTopicMeta } from "@/lib/action-authoring-docs.shared";

function renderTopicRow(
  topic: ActionAuthoringTopicMeta,
  opts: {
    activeTopicId: string | null;
    expandedTopics: Record<string, boolean>;
    selectTopic: (topic: string, titleHint?: string) => void;
    selectReference: (topic: string, file: string, titleHint?: string) => void;
    setPanelOpen: (open: boolean) => void;
    toggleTopicExpanded: (topicId: string) => void;
    setExpandedTopics: React.Dispatch<
      React.SetStateAction<Record<string, boolean>>
    >;
  },
) {
  const refs = topic.references ?? [];
  const hasRefs = refs.length > 0;
  const topicExpanded = opts.expandedTopics[topic.topic] ?? false;
  const topicEntryKey = docViewerEntryKey(topic.topic);
  const topicSelected = opts.activeTopicId === topicEntryKey;

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
              opts.toggleTopicExpanded(topic.topic);
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
          style={{ paddingLeft: hasRefs ? "0.25rem" : "0.95rem" }}
          onClick={() => {
            opts.selectTopic(topic.topic, topic.title);
            opts.setPanelOpen(true);
            if (hasRefs) {
              opts.setExpandedTopics((prev) => ({
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
            const refEntryKey = docViewerEntryKey(topic.topic, ref.id);
            const refSelected = opts.activeTopicId === refEntryKey;
            return (
              <button
                key={ref.id}
                type="button"
                className={`explorer-tree-row${refSelected ? " explorer-tree-row--selected" : ""}`}
                style={{ paddingLeft: "1.5rem" }}
                onClick={() => {
                  opts.selectReference(topic.topic, ref.id, ref.title);
                  opts.setPanelOpen(true);
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
}

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

  const layerGroups = useMemo(
    () => groupTopicsByLayer(catalogTopics),
    [catalogTopics],
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

  const rowOpts = {
    activeTopicId,
    expandedTopics,
    selectTopic,
    selectReference,
    setPanelOpen,
    toggleTopicExpanded,
    setExpandedTopics,
  };

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
          layerGroups.map((group) => (
            <div key={group.layer} className="explorer-tree-layer">
              <div
                className="explorer-tree-layer-label"
                title={group.layer}
              >
                {group.label}
              </div>
              {group.topics.map((topic) => renderTopicRow(topic, rowOpts))}
            </div>
          ))
        )
      ) : null}
    </div>
  );
}
