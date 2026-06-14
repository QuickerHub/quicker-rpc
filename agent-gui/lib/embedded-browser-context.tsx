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
  clampBrowserPanelWidth,
  loadBrowserPanelWidth,
  storeBrowserPanelWidth,
} from "@/lib/browser-panel-prefs";
import type { BrowserPanelSnapshot } from "@/lib/browser-panel-types";
import {
  getThreadBrowserState,
  saveThreadBrowserState,
} from "@/lib/thread-scoped-side-panel";
import { useChatStore } from "@/lib/use-chat-store";
import { workspaceExplorerActionsRef } from "@/lib/workspace-explorer";
import { SIDE_PANEL_VIEW_BROWSER } from "@/lib/workspace-side-panel-view";

export type ApplySnapshotOptions = {
  /** Open/focus the side-panel browser tab. */
  openPanel?: boolean;
  /** Load URL into the embedded browser session (never on cold start replay). */
  navigate?: boolean;
};

type EmbeddedBrowserContextValue = {
  open: boolean;
  width: number;
  snapshot: BrowserPanelSnapshot;
  navigateSeq: number;
  navigateUrl: string | null;
  activeThreadId: string;
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
  const { store } = useChatStore();
  const activeThreadId = store.activeThreadId;
  const initial = getThreadBrowserState(activeThreadId);
  const [open, setOpenState] = useState(initial.open);
  const [width, setWidthState] = useState(() => loadBrowserPanelWidth());
  const [snapshot, setSnapshot] = useState<BrowserPanelSnapshot>(initial.snapshot);
  const [navigateSeq, setNavigateSeq] = useState(initial.navigateSeq);
  const [navigateUrl, setNavigateUrl] = useState<string | null>(initial.navigateUrl);

  const loadedThreadRef = useRef<string | null>(null);
  const navigateSeqRef = useRef(initial.navigateSeq);
  const openRef = useRef(initial.open);
  const snapshotRef = useRef(initial.snapshot);
  const navigateUrlRef = useRef<string | null>(initial.navigateUrl);

  openRef.current = open;
  snapshotRef.current = snapshot;
  navigateUrlRef.current = navigateUrl;
  navigateSeqRef.current = navigateSeq;

  const persistThreadState = useCallback(
    (
      threadId: string,
      next: {
        open: boolean;
        snapshot: BrowserPanelSnapshot;
        navigateSeq: number;
        navigateUrl: string | null;
      },
    ) => {
      saveThreadBrowserState(threadId, next);
    },
    [],
  );

  useEffect(() => {
    const prevThreadId = loadedThreadRef.current;
    if (prevThreadId === activeThreadId) return;

    if (prevThreadId) {
      persistThreadState(prevThreadId, {
        open: openRef.current,
        snapshot: snapshotRef.current,
        navigateSeq: navigateSeqRef.current,
        navigateUrl: navigateUrlRef.current,
      });
    }

    const next = getThreadBrowserState(activeThreadId);
    navigateSeqRef.current = next.navigateSeq;
    setOpenState(next.open);
    setSnapshot(next.snapshot);
    setNavigateSeq(next.navigateSeq);
    setNavigateUrl(next.navigateUrl);
    loadedThreadRef.current = activeThreadId;
  }, [activeThreadId, persistThreadState]);

  useEffect(() => {
    if (!loadedThreadRef.current) return;
    persistThreadState(loadedThreadRef.current, {
      open,
      snapshot,
      navigateSeq,
      navigateUrl,
    });
  }, [navigateSeq, navigateUrl, open, persistThreadState, snapshot]);

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      persistThreadState(activeThreadId, {
        open: next,
        snapshot,
        navigateSeq,
        navigateUrl,
      });
    },
    [activeThreadId, navigateSeq, navigateUrl, persistThreadState, snapshot],
  );

  const toggleOpen = useCallback(() => {
    setOpen(!open);
  }, [open, setOpen]);

  const setWidth = useCallback((next: number) => {
    const clamped = clampBrowserPanelWidth(next);
    setWidthState(clamped);
    storeBrowserPanelWidth(clamped);
  }, []);

  const applySnapshot = useCallback(
    (patch: Partial<BrowserPanelSnapshot>, options?: ApplySnapshotOptions) => {
      const openPanel = options?.openPanel === true;
      const navigate = options?.navigate === true;
      const nextSnapshot = {
        ...snapshot,
        ...patch,
        sessionId: activeThreadId,
      };

      let nextNavigateSeq = navigateSeq;
      let nextNavigateUrl = navigateUrl;
      if (navigate && patch.url?.trim()) {
        navigateSeqRef.current += 1;
        nextNavigateSeq = navigateSeqRef.current;
        nextNavigateUrl = patch.url.trim();
        setNavigateSeq(nextNavigateSeq);
        setNavigateUrl(nextNavigateUrl);
      }

      const nextOpen = openPanel ? true : open;
      setSnapshot(nextSnapshot);
      if (openPanel) {
        setOpenState(true);
        workspaceExplorerActionsRef.current.focusSidePanelView(
          SIDE_PANEL_VIEW_BROWSER,
        );
      }

      persistThreadState(activeThreadId, {
        open: nextOpen,
        snapshot: nextSnapshot,
        navigateSeq: nextNavigateSeq,
        navigateUrl: nextNavigateUrl,
      });
    },
    [
      activeThreadId,
      navigateSeq,
      navigateUrl,
      open,
      persistThreadState,
      snapshot,
    ],
  );

  const resetSnapshot = useCallback(() => {
    const next = getThreadBrowserState(activeThreadId);
    setSnapshot(next.snapshot);
    setNavigateSeq(next.navigateSeq);
    setNavigateUrl(next.navigateUrl);
    persistThreadState(activeThreadId, {
      open,
      snapshot: next.snapshot,
      navigateSeq: next.navigateSeq,
      navigateUrl: next.navigateUrl,
    });
  }, [activeThreadId, open, persistThreadState]);

  const value = useMemo(
    () => ({
      open,
      width,
      snapshot,
      navigateSeq,
      navigateUrl,
      activeThreadId,
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
      activeThreadId,
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
