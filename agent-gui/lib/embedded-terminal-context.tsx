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
  setTerminalAllTabsClosedHandler,
  useEmbeddedTerminalTabs,
} from "@/lib/embedded-terminal-tabs";
import { prefetchTerminalStack } from "@/lib/terminal-session-client";
import { workspaceExplorerActionsRef } from "@/lib/workspace-explorer";
import {
  SIDE_PANEL_VIEW_EXPLORER,
  SIDE_PANEL_VIEW_TERMINAL,
} from "@/lib/workspace-side-panel-view";

type EmbeddedTerminalContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
};

const EmbeddedTerminalContext =
  createContext<EmbeddedTerminalContextValue | null>(null);

function EmbeddedTerminalProviderInner({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(false);
  const { disposeAll, ensureInitialTab } = useEmbeddedTerminalTabs();

  const enterTerminalView = useCallback(() => {
    ensureInitialTab();
    prefetchTerminalStack();
    workspaceExplorerActionsRef.current.setPanelOpen(true);
    workspaceExplorerActionsRef.current.setActiveSideView(SIDE_PANEL_VIEW_TERMINAL);
  }, [ensureInitialTab]);

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      if (next) {
        enterTerminalView();
        return;
      }
      disposeAll();
    },
    [disposeAll, enterTerminalView],
  );

  const toggleOpen = useCallback(() => {
    setOpenState((prev) => {
      const next = !prev;
      if (next) {
        enterTerminalView();
      } else {
        disposeAll();
      }
      return next;
    });
  }, [disposeAll, enterTerminalView]);

  useEffect(() => {
    if (!open) return;
    prefetchTerminalStack();
  }, [open]);

  useEffect(() => {
    setTerminalAllTabsClosedHandler(() => {
      setOpenState(false);
      disposeAll();
      workspaceExplorerActionsRef.current.setActiveSideView(
        SIDE_PANEL_VIEW_EXPLORER,
      );
    });
    return () => setTerminalAllTabsClosedHandler(null);
  }, [disposeAll]);

  const value = useMemo(
    () => ({ open, setOpen, toggleOpen }),
    [open, setOpen, toggleOpen],
  );

  return (
    <EmbeddedTerminalContext.Provider value={value}>
      {children}
    </EmbeddedTerminalContext.Provider>
  );
}

export function EmbeddedTerminalProvider({ children }: { children: ReactNode }) {
  return <EmbeddedTerminalProviderInner>{children}</EmbeddedTerminalProviderInner>;
}

export function useEmbeddedTerminal(): EmbeddedTerminalContextValue {
  const ctx = useContext(EmbeddedTerminalContext);
  if (!ctx) {
    throw new Error(
      "useEmbeddedTerminal must be used within EmbeddedTerminalProvider",
    );
  }
  return ctx;
}
