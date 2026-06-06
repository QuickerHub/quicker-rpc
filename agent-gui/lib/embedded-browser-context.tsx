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
  clampBrowserPanelWidth,
  loadBrowserPanelOpen,
  loadBrowserPanelWidth,
  storeBrowserPanelOpen,
  storeBrowserPanelWidth,
} from "@/lib/browser-panel-prefs";
import type { BrowserPanelSnapshot } from "@/lib/browser-panel-types";
import { EMPTY_BROWSER_PANEL_SNAPSHOT } from "@/lib/browser-panel-types";
import { workspaceExplorerActionsRef } from "@/lib/workspace-explorer";
import { SIDE_PANEL_VIEW_BROWSER } from "@/lib/workspace-side-panel-view";

export type ApplySnapshotOptions = {
  /** Open/focus the side-panel browser tab. */
  openPanel?: boolean;
  /** Load URL into the Tauri child WebView (never on cold start replay). */
  navigate?: boolean;
};

type EmbeddedBrowserContextValue = {
  open: boolean;
  width: number;
  snapshot: BrowserPanelSnapshot;
  navigateSeq: number;
  navigateUrl: string | null;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setWidth: (width: number) => void;
  applySnapshot: (
    patch: Partial<BrowserPanelSnapshot>,
    options?: ApplySnapshotOptions,
  ) => void;
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
  const [navigateSeq, setNavigateSeq] = useState(0);
  const [navigateUrl, setNavigateUrl] = useState<string | null>(null);
  const navigateSeqRef = useRef(0);

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

  const applySnapshot = useCallback(
    (patch: Partial<BrowserPanelSnapshot>, options?: ApplySnapshotOptions) => {
      setSnapshot((prev) => ({ ...prev, ...patch }));
      const openPanel = options?.openPanel === true;
      const navigate = options?.navigate === true;
      if (openPanel && (patch.url || patch.previewBase64)) {
        setOpenState(true);
        storeBrowserPanelOpen(true);
        workspaceExplorerActionsRef.current.focusSidePanelView(
          SIDE_PANEL_VIEW_BROWSER,
        );
      }
      if (navigate && patch.url?.trim()) {
        navigateSeqRef.current += 1;
        setNavigateSeq(navigateSeqRef.current);
        setNavigateUrl(patch.url.trim());
      }
    },
    [],
  );

  const resetSnapshot = useCallback(() => {
    setSnapshot(EMPTY_BROWSER_PANEL_SNAPSHOT);
  }, []);

  const value = useMemo(
    () => ({
      open,
      width,
      snapshot,
      navigateSeq,
      navigateUrl,
      setOpen,
      toggleOpen,
      setWidth,
      applySnapshot,
      resetSnapshot,
    }),
    [
      open,
      width,
      snapshot,
      navigateSeq,
      navigateUrl,
      setOpen,
      toggleOpen,
      setWidth,
      applySnapshot,
      resetSnapshot,
    ],
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
