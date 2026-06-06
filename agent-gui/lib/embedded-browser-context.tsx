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
  clampBrowserPanelWidth,
  loadBrowserPanelOpen,
  loadBrowserPanelWidth,
  storeBrowserPanelOpen,
  storeBrowserPanelWidth,
} from "@/lib/browser-panel-prefs";
import type { BrowserPanelSnapshot } from "@/lib/browser-panel-types";
import { EMPTY_BROWSER_PANEL_SNAPSHOT } from "@/lib/browser-panel-types";

type EmbeddedBrowserContextValue = {
  open: boolean;
  width: number;
  snapshot: BrowserPanelSnapshot;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setWidth: (width: number) => void;
  applySnapshot: (patch: Partial<BrowserPanelSnapshot>) => void;
  resetSnapshot: () => void;
};

const EmbeddedBrowserContext = createContext<EmbeddedBrowserContextValue | null>(
  null,
);

export function EmbeddedBrowserProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(() => loadBrowserPanelOpen());
  const [width, setWidthState] = useState(() => loadBrowserPanelWidth());
  const [snapshot, setSnapshot] = useState<BrowserPanelSnapshot>(
    EMPTY_BROWSER_PANEL_SNAPSHOT,
  );

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    storeBrowserPanelOpen(next);
  }, []);

  const toggleOpen = useCallback(() => {
    setOpenState((prev) => {
      const next = !prev;
      storeBrowserPanelOpen(next);
      return next;
    });
  }, []);

  const setWidth = useCallback((next: number) => {
    const clamped = clampBrowserPanelWidth(next);
    setWidthState(clamped);
    storeBrowserPanelWidth(clamped);
  }, []);

  const applySnapshot = useCallback((patch: Partial<BrowserPanelSnapshot>) => {
    setSnapshot((prev) => ({ ...prev, ...patch }));
    if (patch.url || patch.previewBase64) {
      setOpenState(true);
      storeBrowserPanelOpen(true);
    }
  }, []);

  const resetSnapshot = useCallback(() => {
    setSnapshot(EMPTY_BROWSER_PANEL_SNAPSHOT);
  }, []);

  const value = useMemo(
    () => ({
      open,
      width,
      snapshot,
      setOpen,
      toggleOpen,
      setWidth,
      applySnapshot,
      resetSnapshot,
    }),
    [open, width, snapshot, setOpen, toggleOpen, setWidth, applySnapshot, resetSnapshot],
  );

  return (
    <EmbeddedBrowserContext.Provider value={value}>
      {children}
    </EmbeddedBrowserContext.Provider>
  );
}

export function useEmbeddedBrowser(): EmbeddedBrowserContextValue {
  const ctx = useContext(EmbeddedBrowserContext);
  if (!ctx) {
    throw new Error("useEmbeddedBrowser must be used within EmbeddedBrowserProvider");
  }
  return ctx;
}

export function useEmbeddedBrowserOptional(): EmbeddedBrowserContextValue | null {
  return useContext(EmbeddedBrowserContext);
}
