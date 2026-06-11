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
import { useEmbeddedTerminalTabs } from "@/lib/embedded-terminal-tabs";
import { prefetchTerminalStack } from "@/lib/terminal-session-client";
import { workspaceExplorerActionsRef } from "@/lib/workspace-explorer";
import { SIDE_PANEL_VIEW_TERMINAL } from "@/lib/workspace-side-panel-view";

type EmbeddedTerminalContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
};

const EmbeddedTerminalContext =
  createContext<EmbeddedTerminalContextValue | null>(null);

function EmbeddedTerminalProviderInner({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(false);
  const { disposeAll } = useEmbeddedTerminalTabs();

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      if (next) {
        prefetchTerminalStack();
        workspaceExplorerActionsRef.current.setPanelOpen(true);
        workspaceExplorerActionsRef.current.setActiveSideView(
          SIDE_PANEL_VIEW_TERMINAL,
        );
        return;
      }
      disposeAll();
    },
    [disposeAll],
  );

  const toggleOpen = useCallback(() => {
    setOpenState((prev) => {
      const next = !prev;
      if (next) {
        prefetchTerminalStack();
        workspaceExplorerActionsRef.current.setPanelOpen(true);
        workspaceExplorerActionsRef.current.setActiveSideView(
          SIDE_PANEL_VIEW_TERMINAL,
        );
      } else {
        disposeAll();
      }
      return next;
    });
  }, [disposeAll]);

  useEffect(() => {
    if (!open) return;
    prefetchTerminalStack();
  }, [open]);

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
