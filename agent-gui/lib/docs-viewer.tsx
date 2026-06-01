"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { DocsGetDoc } from "@/lib/docs-tool";

export type DocViewerTab = DocsGetDoc & {
  id: string;
};

type DocsViewerContextValue = {
  tabs: DocViewerTab[];
  /** `null` = chat view */
  activeTabId: string | null;
  openDoc: (doc: DocsGetDoc) => void;
  closeTab: (id: string) => void;
  setActiveTabId: (id: string | null) => void;
  activeDoc: DocViewerTab | null;
};

const DocsViewerContext = createContext<DocsViewerContextValue | null>(null);

export function DocsViewerProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<DocViewerTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const openDoc = useCallback((doc: DocsGetDoc) => {
    const id = doc.topic;
    setTabs((prev) => {
      const existing = prev.find((tab) => tab.id === id);
      if (existing) {
        return prev.map((tab) => (tab.id === id ? { ...tab, ...doc } : tab));
      }
      return [...prev, { ...doc, id }];
    });
    setActiveTabId(id);
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const next = prev.filter((tab) => tab.id !== id);
      setActiveTabId((active) => {
        if (active !== id) return active;
        return next.length > 0 ? next[next.length - 1]!.id : null;
      });
      return next;
    });
  }, []);

  const activeDoc = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [tabs, activeTabId],
  );

  const value = useMemo(
    () => ({
      tabs,
      activeTabId,
      openDoc,
      closeTab,
      setActiveTabId,
      activeDoc,
    }),
    [tabs, activeTabId, openDoc, closeTab, activeDoc],
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
