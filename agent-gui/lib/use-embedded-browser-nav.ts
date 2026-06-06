"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowserPanelSnapshot } from "@/lib/browser-panel-types";
import { normalizeEmbeddedBrowserUrl } from "@/lib/embedded-browser-url";
import type { ApplySnapshotOptions } from "@/lib/embedded-browser-context";

type UseEmbeddedBrowserNavOptions = {
  snapshot: BrowserPanelSnapshot;
  navigateSeq: number;
  navigateUrl: string | null;
  applySnapshot: (
    patch: Partial<BrowserPanelSnapshot>,
    options?: ApplySnapshotOptions,
  ) => void;
  enabled: boolean;
};

/** Address bar + history for the native Tauri child WebView (no Playwright). */
export function useEmbeddedBrowserNav({
  snapshot,
  navigateSeq,
  navigateUrl,
  applySnapshot,
  enabled,
}: UseEmbeddedBrowserNavOptions) {
  const [urlDraft, setUrlDraft] = useState("");
  const [frameUrl, setFrameUrl] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const userNavRef = useRef(false);
  const lastNavigateSeqRef = useRef(0);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    if (!snapshot.url || userNavRef.current) return;
    setUrlDraft(snapshot.url);
  }, [snapshot.url]);

  const pushHistory = useCallback((url: string) => {
    setHistory((prev) => {
      const next = [...prev.slice(0, historyIndex + 1), url];
      setHistoryIndex(next.length - 1);
      return next;
    });
  }, [historyIndex]);

  const navigateTo = useCallback(
    (rawUrl: string, fromUser = true) => {
      const normalized = normalizeEmbeddedBrowserUrl(rawUrl);
      if (!normalized) return;
      if (fromUser) userNavRef.current = true;
      pushHistory(normalized);
      setFrameUrl(normalized);
      setUrlDraft(normalized);
      applySnapshot({ url: normalized });
      if (fromUser) userNavRef.current = false;
    },
    [applySnapshot, pushHistory],
  );

  useEffect(() => {
    if (!enabled || !navigateUrl || navigateSeq <= lastNavigateSeqRef.current) {
      return;
    }
    lastNavigateSeqRef.current = navigateSeq;
    navigateTo(navigateUrl, false);
  }, [enabled, navigateSeq, navigateUrl, navigateTo]);

  const submitUrl = useCallback(() => {
    navigateTo(urlDraft, true);
  }, [navigateTo, urlDraft]);

  const goBack = useCallback(() => {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    const url = history[nextIndex];
    if (!url) return;
    setHistoryIndex(nextIndex);
    setFrameUrl(url);
    setUrlDraft(url);
    setReloadKey((key) => key + 1);
    applySnapshot({ url });
  }, [applySnapshot, history, historyIndex]);

  const goForward = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    const url = history[nextIndex];
    if (!url) return;
    setHistoryIndex(nextIndex);
    setFrameUrl(url);
    setUrlDraft(url);
    setReloadKey((key) => key + 1);
    applySnapshot({ url });
  }, [applySnapshot, history, historyIndex]);

  const reload = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  const retryBootstrap = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  const canGoBack = historyIndex > 0;
  const canGoForward =
    historyIndex >= 0 && historyIndex < history.length - 1;

  return {
    urlDraft,
    setUrlDraft,
    frameUrl,
    reloadKey,
    busy: false,
    bootstrapping: false,
    runtimeError: null as string | null,
    canGoBack,
    canGoForward,
    submitUrl,
    goBack,
    goForward,
    reload,
    retryBootstrap,
  };
}
