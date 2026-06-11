"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { embeddedBrowserClose } from "@/lib/embedded-browser-tauri";
import { workspaceExplorerActionsRef } from "@/lib/workspace-explorer";
import { sidePanelBrowserViewId } from "@/lib/workspace-side-panel-view";

export type EmbeddedBrowserTab = {
  id: string;
  url: string;
  title: string;
};

type EmbeddedBrowserTabsContextValue = {
  tabs: EmbeddedBrowserTab[];
  addTab: (url?: string) => string;
  closeTab: (id: string) => void;
  updateTab: (id: string, patch: Partial<Pick<EmbeddedBrowserTab, "url" | "title">>) => void;
};

const EmbeddedBrowserTabsContext =
  createContext<EmbeddedBrowserTabsContextValue | null>(null);

let tabCounter = 0;

function nextTabId(): string {
  tabCounter += 1;
  return `bt-${Date.now().toString(36)}-${tabCounter}`;
}

/** User-created embedded browser tabs (shared across threads, like file tabs). */
export function EmbeddedBrowserTabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<EmbeddedBrowserTab[]>([]);

  const addTab = useCallback((url?: string) => {
    const id = nextTabId();
    setTabs((prev) => [
      ...prev,
      { id, url: url?.trim() ?? "", title: "" },
    ]);
    workspaceExplorerActionsRef.current.focusSidePanelView(
      sidePanelBrowserViewId(id),
    );
    return id;
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => prev.filter((tab) => tab.id !== id));
    void embeddedBrowserClose(id).catch(() => {});
  }, []);

  const updateTab = useCallback(
    (id: string, patch: Partial<Pick<EmbeddedBrowserTab, "url" | "title">>) => {
      setTabs((prev) =>
        prev.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)),
      );
    },
    [],
  );

  const value = useMemo(
    () => ({ tabs, addTab, closeTab, updateTab }),
    [tabs, addTab, closeTab, updateTab],
  );

  return (
    <EmbeddedBrowserTabsContext.Provider value={value}>
      {children}
    </EmbeddedBrowserTabsContext.Provider>
  );
}

export function useEmbeddedBrowserTabs(): EmbeddedBrowserTabsContextValue {
  const ctx = useContext(EmbeddedBrowserTabsContext);
  if (!ctx) {
    throw new Error(
      "useEmbeddedBrowserTabs must be used within EmbeddedBrowserTabsProvider",
    );
  }
  return ctx;
}
