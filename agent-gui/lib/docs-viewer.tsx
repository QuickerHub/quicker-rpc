"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ActionAuthoringTopicMeta } from "@/lib/action-authoring-docs";
import { fetchDocByTopic, fetchDocsCatalog } from "@/lib/docs-catalog-api";
import type { DocsGetDoc } from "@/lib/docs-tool";

export type DocViewerEntry = {
  topic: string;
  title: string;
  description?: string;
  markdown?: string;
  loading?: boolean;
  error?: string;
};

type DocsViewerContextValue = {
  catalogTopics: ActionAuthoringTopicMeta[];
  catalogLoading: boolean;
  catalogError: string | null;
  refreshCatalog: () => Promise<void>;
  activeTopicId: string | null;
  activeDoc: DocViewerEntry | null;
  openDoc: (doc: DocsGetDoc) => void;
  selectTopic: (topic: string, titleHint?: string) => void;
  clearActiveTopic: () => void;
};

const DocsViewerContext = createContext<DocsViewerContextValue | null>(null);

export function DocsViewerProvider({ children }: { children: ReactNode }) {
  const [catalogTopics, setCatalogTopics] = useState<ActionAuthoringTopicMeta[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, DocViewerEntry>>({});
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);

  const refreshCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const topics = await fetchDocsCatalog();
      setCatalogTopics(topics);
    } catch (error) {
      setCatalogError(
        error instanceof Error ? error.message : "无法加载文档目录",
      );
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  const loadTopic = useCallback(async (topic: string, titleHint?: string) => {
    setEntries((prev) => {
      const existing = prev[topic];
      if (existing?.markdown) return prev;
      return {
        ...prev,
        [topic]: {
          topic,
          title: titleHint ?? existing?.title ?? topic,
          description: existing?.description,
          loading: true,
          error: undefined,
        },
      };
    });

    try {
      const doc = await fetchDocByTopic(topic);
      setEntries((prev) => ({
        ...prev,
        [topic]: {
          topic: doc.topic,
          title: doc.title,
          markdown: doc.markdown,
          loading: false,
        },
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "无法加载文档";
      setEntries((prev) => ({
        ...prev,
        [topic]: {
          topic,
          title: titleHint ?? prev[topic]?.title ?? topic,
          loading: false,
          error: message,
        },
      }));
    }
  }, []);

  const openDoc = useCallback((doc: DocsGetDoc) => {
    setEntries((prev) => ({
      ...prev,
      [doc.topic]: {
        topic: doc.topic,
        title: doc.title,
        description: doc.description,
        markdown: doc.markdown,
        loading: false,
      },
    }));
    setActiveTopicId(doc.topic);
  }, []);

  const selectTopic = useCallback(
    (topic: string, titleHint?: string) => {
      setActiveTopicId(topic);
      const meta = catalogTopics.find((t) => t.topic === topic);
      void loadTopic(topic, titleHint ?? meta?.title);
    },
    [catalogTopics, loadTopic],
  );

  const clearActiveTopic = useCallback(() => {
    setActiveTopicId(null);
  }, []);

  const activeDoc = useMemo((): DocViewerEntry | null => {
    if (!activeTopicId) return null;
    const entry = entries[activeTopicId];
    if (entry) return entry;
    const meta = catalogTopics.find((t) => t.topic === activeTopicId);
    if (!meta) return null;
    return {
      topic: meta.topic,
      title: meta.title,
      description: meta.description,
      loading: true,
    };
  }, [entries, activeTopicId, catalogTopics]);

  const value = useMemo(
    () => ({
      catalogTopics,
      catalogLoading,
      catalogError,
      refreshCatalog,
      activeTopicId,
      activeDoc,
      openDoc,
      selectTopic,
      clearActiveTopic,
    }),
    [
      catalogTopics,
      catalogLoading,
      catalogError,
      refreshCatalog,
      activeTopicId,
      activeDoc,
      openDoc,
      selectTopic,
      clearActiveTopic,
    ],
  );

  return (
    <DocsViewerContext.Provider value={value}>
      {children}
    </DocsViewerContext.Provider>
  );
}

export function useDocsViewer(): DocsViewerContextValue {
  const ctx = useContext(DocsViewerContext);
  if (!ctx) {
    throw new Error("useDocsViewer must be used within DocsViewerProvider");
  }
  return ctx;
}
