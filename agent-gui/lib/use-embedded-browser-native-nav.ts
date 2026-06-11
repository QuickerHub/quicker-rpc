"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowserPanelSnapshot } from "@/lib/browser-panel-types";
import type { ApplySnapshotOptions } from "@/lib/embedded-browser-context";
import {
  DEFAULT_EMBEDDED_BROWSER_ID,
  embeddedBrowserGoBack,
  embeddedBrowserGoForward,
  embeddedBrowserNavigate,
  embeddedBrowserReload,
} from "@/lib/embedded-browser-tauri";
import { normalizeEmbeddedBrowserUrl } from "@/lib/embedded-browser-url";
import { useEmbeddedBrowserNavigationState } from "@/lib/use-embedded-browser-navigation-state";

type UseEmbeddedBrowserNativeNavOptions = {
  snapshot: BrowserPanelSnapshot;
  navigateSeq: number;
  navigateUrl: string | null;
  applySnapshot: (
    patch: Partial<BrowserPanelSnapshot>,
    options?: ApplySnapshotOptions,
  ) => void;
  enabled: boolean;
  /** Electron multi-browser instance id (default browser when omitted). */
  browserId?: string;
};

/** Address bar + Electron/Tauri embedded WebContentsView navigation (no Playwright). */
export function useEmbeddedBrowserNativeNav({
  snapshot,
  navigateSeq,
  navigateUrl,
  applySnapshot,
  enabled,
  browserId = DEFAULT_EMBEDDED_BROWSER_ID,
}: UseEmbeddedBrowserNativeNavOptions) {
  const [urlDraft, setUrlDraft] = useState(snapshot.url ?? "");
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const lastNavigateSeqRef = useRef(0);
  const hasUrl = Boolean(snapshot.url?.trim());
  const navState = useEmbeddedBrowserNavigationState(enabled && hasUrl, browserId);

  useEffect(() => {
    if (!snapshot.url) return;
    setUrlDraft(snapshot.url);
  }, [snapshot.url]);

  useEffect(() => {
    if (!navState) return;
    const nextUrl = navState.url.trim();
    const nextTitle = navState.title.trim();
    const urlChanged = nextUrl && nextUrl !== (snapshot.url ?? "");
    const titleChanged = nextTitle && nextTitle !== (snapshot.title ?? "");
    if (!urlChanged && !titleChanged) return;
    applySnapshot({
      ...(urlChanged ? { url: nextUrl } : {}),
      ...(titleChanged ? { title: nextTitle } : {}),
    });
    if (urlChanged) setUrlDraft(nextUrl);
  }, [applySnapshot, navState, snapshot.title, snapshot.url]);

  const runNavAction = useCallback(
    async (action: () => Promise<void>) => {
      if (!enabled) return;
      setBusy(true);
      try {
        await action();
      } catch {
        // WebView may not be mounted yet; EmbeddedWebView mount handles first load.
      } finally {
        setBusy(false);
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled || !navigateUrl || navigateSeq <= lastNavigateSeqRef.current) {
      return;
    }
    lastNavigateSeqRef.current = navigateSeq;
    const normalized = normalizeEmbeddedBrowserUrl(navigateUrl);
    if (!normalized) return;
    setUrlDraft(normalized);
    applySnapshot({ url: normalized });
    void runNavAction(() => embeddedBrowserNavigate(normalized, browserId));
  }, [applySnapshot, browserId, enabled, navigateSeq, navigateUrl, runNavAction]);

  const submitUrl = useCallback(() => {
    const normalized = normalizeEmbeddedBrowserUrl(urlDraft);
    if (!normalized) return;
    setUrlDraft(normalized);
    applySnapshot({ url: normalized });
    void runNavAction(() => embeddedBrowserNavigate(normalized, browserId));
  }, [applySnapshot, browserId, runNavAction, urlDraft]);

  const goBack = useCallback(() => {
    void runNavAction(() => embeddedBrowserGoBack(browserId));
  }, [browserId, runNavAction]);

  const goForward = useCallback(() => {
    void runNavAction(() => embeddedBrowserGoForward(browserId));
  }, [browserId, runNavAction]);

  const reload = useCallback(() => {
    setReloadKey((key) => key + 1);
    void runNavAction(() => embeddedBrowserReload(browserId));
  }, [browserId, runNavAction]);

  return {
    urlDraft,
    setUrlDraft,
    busy,
    bootstrapping: false,
    runtimeError: null as string | null,
    canGoBack: navState?.canGoBack ?? false,
    canGoForward: navState?.canGoForward ?? false,
    displayUrl: snapshot.url?.trim() ?? "",
    reloadKey: navigateSeq * 10_000 + reloadKey,
    submitUrl,
    goBack,
    goForward,
    reload,
    retryBootstrap: () => {},
  };
}
