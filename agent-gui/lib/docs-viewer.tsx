"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

export type DocViewerEntry = Omit<DocsGetDoc, "markdown"> & {
  markdown?: string;
  loading?: boolean;
  error?: string;
};

function viewerEntryKey(doc: Pick<DocsGetDoc, "topic" | "reference" | "guideSource" | "gatewayKnowledge">): string {
  if (doc.guideSource !== "gateway") return docViewerEntryKey(doc.topic, doc.reference);
  const gateway = doc.gatewayKnowledge?.gateway;
  return JSON.stringify(["gateway", gateway?.transport ?? "unknown", gateway?.identity ?? "unknown", doc.topic, doc.reference ?? null]);
}

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
  const entryGenerations = useRef(new Map<string, number>());
  const nextGeneration = useRef(0);

  useEffect(() => () => { entryGenerations.current.clear(); }, []);

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
      const generation = ++nextGeneration.current;
      entryGenerations.current.set(entryKey, generation);
      const isCurrent = () => entryGenerations.current.get(entryKey) === generation;
      setEntries((prev) => {
        const existing = prev[entryKey];
        return {
          ...prev,
          [entryKey]: {
            topic,
            reference,
            title: titleHint ?? existing?.title ?? topic,
            description: existing?.description,
            guideSource: "local",
            loading: true,
            error: undefined,
          },
        };
      });

      try {
        const doc = reference
          ? await fetchDocReference(topic, reference)
          : await fetchDocByTopic(topic);
        if (!isCurrent()) return;
        setEntries((prev) => ({
          ...prev,
          [entryKey]: {
            ...doc,
            loading: false,
          },
        }));
      } catch (error) {
        if (!isCurrent()) return;
        const message =
          error instanceof Error ? error.message : "无法加载文档";
        setEntries((prev) => ({
          ...prev,
          [entryKey]: {
            topic,
            reference,
            title: titleHint ?? prev[entryKey]?.title ?? topic,
            guideSource: "local",
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
    const entryKey = viewerEntryKey(doc);
    // A tool receipt supersedes an earlier fetch for this exact source and document.
    entryGenerations.current.set(entryKey, ++nextGeneration.current);
    setEntries((prev) => ({
      ...prev,
      [entryKey]: {
        ...doc,
        reference,
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

export function useOptionalDocsViewer(): DocsViewerContextValue | null {
  return useContext(DocsViewerContext);
}
