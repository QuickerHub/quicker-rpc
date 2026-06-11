"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  disposeAllTerminalSessions,
  disposeTerminalSessionClient,
} from "@/lib/terminal-session-client";

export type EmbeddedTerminalTab = {
  id: string;
  label: string;
};

type EmbeddedTerminalTabsContextValue = {
  tabs: EmbeddedTerminalTab[];
  activeTerminalId: string | null;
  setActiveTerminalId: (id: string) => void;
  /** Ensure at least one internal tab exists; returns its id. */
  ensureInitialTab: () => string;
  addTab: () => string;
  closeTab: (id: string) => void;
  renameTab: (id: string, label: string) => void;
  disposeAll: () => void;
  mountedTerminalIds: (panelOpen: boolean) => string[];
};

const EmbeddedTerminalTabsContext =
  createContext<EmbeddedTerminalTabsContextValue | null>(null);

let tabCounter = 0;
let onAllTabsClosedHandler: (() => void) | null = null;

/** Wired by EmbeddedTerminalProvider when the last internal tab is closed. */
export function setTerminalAllTabsClosedHandler(handler: (() => void) | null): void {
  onAllTabsClosedHandler = handler;
}

function nextTerminalTabId(): string {
  tabCounter += 1;
  return `tt-${Date.now().toString(36)}-${tabCounter}`;
}

function tabLabelForIndex(index: number): string {
  return index === 0 ? "终端" : `终端 ${index + 1}`;
}

/** Internal terminal tabs — managed only inside the terminal panel (not side header). */
export function EmbeddedTerminalTabsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [tabs, setTabs] = useState<EmbeddedTerminalTab[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const ensureInitialTab = useCallback((): string => {
    const existing = tabsRef.current;
    if (existing.length > 0) {
      const id = existing[0]!.id;
      setActiveTerminalId((current) =>
        current && existing.some((tab) => tab.id === current) ? current : id,
      );
      return id;
    }
    const id = nextTerminalTabId();
    setTabs([{ id, label: tabLabelForIndex(0) }]);
    setActiveTerminalId(id);
    return id;
  }, []);

  const addTab = useCallback(() => {
    const id = nextTerminalTabId();
    setTabs((prev) => [
      ...prev,
      { id, label: tabLabelForIndex(prev.length) },
    ]);
    setActiveTerminalId(id);
    return id;
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const next = prev.filter((tab) => tab.id !== id);
      if (activeTerminalId === id) {
        setActiveTerminalId(next[next.length - 1]?.id ?? null);
      }
      if (next.length === 0) {
        queueMicrotask(() => onAllTabsClosedHandler?.());
      }
      return next;
    });
    disposeTerminalSessionClient(id);
  }, [activeTerminalId]);

  const renameTab = useCallback((id: string, label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setTabs((prev) =>
      prev.map((tab) => (tab.id === id ? { ...tab, label: trimmed } : tab)),
    );
  }, []);

  const disposeAll = useCallback(() => {
    disposeAllTerminalSessions();
    setTabs([]);
    setActiveTerminalId(null);
  }, []);

  const mountedTerminalIds = useCallback(
    (panelOpen: boolean) => {
      if (!panelOpen) return [];
      return tabsRef.current.map((tab) => tab.id);
    },
    [],
  );

  const value = useMemo(
    () => ({
      tabs,
      activeTerminalId,
      setActiveTerminalId,
      ensureInitialTab,
      addTab,
      closeTab,
      renameTab,
      disposeAll,
      mountedTerminalIds,
    }),
    [
      tabs,
      activeTerminalId,
      ensureInitialTab,
      addTab,
      closeTab,
      renameTab,
      disposeAll,
      mountedTerminalIds,
    ],
  );

  return (
    <EmbeddedTerminalTabsContext.Provider value={value}>
      {children}
    </EmbeddedTerminalTabsContext.Provider>
  );
}

export function useEmbeddedTerminalTabs(): EmbeddedTerminalTabsContextValue {
  const ctx = useContext(EmbeddedTerminalTabsContext);
  if (!ctx) {
    throw new Error(
      "useEmbeddedTerminalTabs must be used within EmbeddedTerminalTabsProvider",
    );
  }
  return ctx;
}
