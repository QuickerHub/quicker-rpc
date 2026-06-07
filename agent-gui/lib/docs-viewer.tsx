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
import {
  docViewerEntryKey,
  type ActionAuthoringTopicMeta,
} from "@/lib/action-authoring-docs.shared";
import {
  fetchDocByTopic,
  fetchDocReference,
  fetchDocsCatalog,
} from "@/lib/docs-catalog-api";
import type { DocsGetDoc } from "@/lib/docs-tool";
import { openWorkspaceMainEditorTab } from "@/lib/workspace-main-editor-tab";
import { useOptionalWorkspaceExplorerShell } from "@/lib/workspace-explorer";

export type DocViewerEntry = {
  topic: string;
  reference?: string;
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
  selectReference: (
    topic: string,
    file: string,
    titleHint?: string,
  ) => void;
  clearActiveTopic: () => void;
};

const DocsViewerContext = createContext<DocsViewerContextValue | null>(null);

export function DocsViewerProvider({ children }: { children: ReactNode }) {
  const panelOpen = useOptionalWorkspaceExplorerShell()?.panelOpen ?? false;
  const [catalogTopics, setCatalogTopics] = useState<ActionAuthoringTopicMeta[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
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
    if (!panelOpen) return;
    void refreshCatalog();
  }, [panelOpen, refreshCatalog]);

  const loadEntry = useCallback(
    async (
      topic: string,
      titleHint: string | undefined,
      reference?: string,
    ) => {
      const entryKey = docViewerEntryKey(topic, reference);
      setEntries((prev) => {
        const existing = prev[entryKey];
        if (existing?.markdown) return prev;
        return {
          ...prev,
          [entryKey]: {
            topic,
            reference,
            title: titleHint ?? existing?.title ?? topic,
            description: existing?.description,
            loading: true,
            error: undefined,
          },
        };
      });

      try {
        const doc = reference
          ? await fetchDocReference(topic, reference)
          : await fetchDocByTopic(topic);
        setEntries((prev) => ({
          ...prev,
          [entryKey]: {
            topic: doc.topic,
            reference: "reference" in doc ? doc.reference : undefined,
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
          [entryKey]: {
            topic,
            reference,
            title: titleHint ?? prev[entryKey]?.title ?? topic,
            loading: false,
            error: message,
          },
        }));
      }
    },
    [],
  );

  const openDoc = useCallback((doc: DocsGetDoc) => {
    const reference =
      "reference" in doc && typeof doc.reference === "string"
        ? doc.reference
        : undefined;
    const entryKey = docViewerEntryKey(doc.topic, reference);
    setEntries((prev) => ({
      ...prev,
      [entryKey]: {
        topic: doc.topic,
        reference,
        title: doc.title,
        description: doc.description,
        markdown: doc.markdown,
        loading: false,
      },
    }));
    setActiveTopicId(entryKey);
    openWorkspaceMainEditorTab(doc.title);
  }, []);

  const selectTopic = useCallback(
    (topic: string, titleHint?: string) => {
      const entryKey = docViewerEntryKey(topic);
      setActiveTopicId(entryKey);
      const meta = catalogTopics.find((t) => t.topic === topic);
      const title = titleHint ?? meta?.title ?? topic;
      void loadEntry(topic, title);
      openWorkspaceMainEditorTab(title);
    },
    [catalogTopics, loadEntry],
  );

  const selectReference = useCallback(
    (topic: string, file: string, titleHint?: string) => {
      const entryKey = docViewerEntryKey(topic, file);
      setActiveTopicId(entryKey);
      const meta = catalogTopics.find((t) => t.topic === topic);
      const refMeta = meta?.references?.find((r) => r.id === file);
      const title = titleHint ?? refMeta?.title ?? file;
      void loadEntry(topic, title, file);
      openWorkspaceMainEditorTab(title);
    },
    [catalogTopics, loadEntry],
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
      selectReference,
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
      selectReference,
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
