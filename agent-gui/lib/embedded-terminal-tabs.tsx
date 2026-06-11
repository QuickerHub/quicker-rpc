"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  disposeAllTerminalSessions,
  disposeTerminalSessionClient,
  getTerminalSessionClient,
} from "@/lib/terminal-session-client";
import { DEFAULT_EMBEDDED_TERMINAL_ID } from "@/lib/workspace-side-panel-view";

export type EmbeddedTerminalTab = {
  id: string;
  label: string;
};

type EmbeddedTerminalTabsContextValue = {
  /** Extra terminal sessions (default tab is implicit when panel is open). */
  tabs: EmbeddedTerminalTab[];
  activeTerminalId: string;
  setActiveTerminalId: (id: string) => void;
  addTab: () => string;
  closeTab: (id: string) => void;
  renameTab: (id: string, label: string) => void;
  /** Dispose every PTY session and reset internal tab state. */
  disposeAll: () => void;
  /** All terminal ids currently mounted (default + extras). */
  mountedTerminalIds: (panelOpen: boolean) => string[];
};

const EmbeddedTerminalTabsContext =
  createContext<EmbeddedTerminalTabsContextValue | null>(null);

let tabCounter = 0;

function nextTerminalTabId(): string {
  tabCounter += 1;
  return `tt-${Date.now().toString(36)}-${tabCounter}`;
}

function extraTabLabel(index: number): string {
  return `终端 ${index}`;
}

/** Internal terminal tabs inside the single side-panel「终端」view. */
export function EmbeddedTerminalTabsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [tabs, setTabs] = useState<EmbeddedTerminalTab[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState(
    DEFAULT_EMBEDDED_TERMINAL_ID,
  );

  const addTab = useCallback(() => {
    const id = nextTerminalTabId();
    setTabs((prev) => [...prev, { id, label: extraTabLabel(prev.length + 2) }]);
    setActiveTerminalId(id);
    return id;
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      if (id === DEFAULT_EMBEDDED_TERMINAL_ID) return;
      setTabs((prev) => {
        const next = prev.filter((tab) => tab.id !== id);
        if (activeTerminalId === id) {
          const fallback =
            next[next.length - 1]?.id ?? DEFAULT_EMBEDDED_TERMINAL_ID;
          setActiveTerminalId(fallback);
        }
        return next;
      });
      disposeTerminalSessionClient(id);
    },
    [activeTerminalId],
  );

  const renameTab = useCallback((id: string, label: string) => {
    const trimmed = label.trim();
    if (!trimmed || id === DEFAULT_EMBEDDED_TERMINAL_ID) return;
    setTabs((prev) =>
      prev.map((tab) => (tab.id === id ? { ...tab, label: trimmed } : tab)),
    );
  }, []);

  const disposeAll = useCallback(() => {
    disposeAllTerminalSessions();
    setTabs([]);
    setActiveTerminalId(DEFAULT_EMBEDDED_TERMINAL_ID);
  }, []);

  const mountedTerminalIds = useCallback(
    (panelOpen: boolean) => {
      if (!panelOpen) return [];
      const ids = [DEFAULT_EMBEDDED_TERMINAL_ID];
      for (const tab of tabs) {
        if (!ids.includes(tab.id)) ids.push(tab.id);
      }
      return ids;
    },
    [tabs],
  );

  const value = useMemo(
    () => ({
      tabs,
      activeTerminalId,
      setActiveTerminalId,
      addTab,
      closeTab,
      renameTab,
      disposeAll,
      mountedTerminalIds,
    }),
    [
      tabs,
      activeTerminalId,
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

/** Warm default session client entry (no-op if already created). */
export function touchDefaultTerminalSession(cwd: string): void {
  getTerminalSessionClient(DEFAULT_EMBEDDED_TERMINAL_ID, cwd);
}
