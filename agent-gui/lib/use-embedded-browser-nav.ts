"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { requestDevBrowserRuntimeStart } from "@/lib/browser-dev-runtime";
import { runBrowserPanelAction } from "@/lib/browser-panel-client";
import type { BrowserPanelSnapshot } from "@/lib/browser-panel-types";
import { normalizeEmbeddedBrowserUrl } from "@/lib/embedded-browser-url";

type UseEmbeddedBrowserNavOptions = {
  snapshot: BrowserPanelSnapshot;
  applySnapshot: (patch: Partial<BrowserPanelSnapshot>) => void;
  enabled: boolean;
  viewportRef: RefObject<HTMLElement | null>;
};

/** Native browser display + background Playwright sync for Agent tools. */
export function useEmbeddedBrowserNav({
  snapshot,
  applySnapshot,
  enabled,
  viewportRef,
}: UseEmbeddedBrowserNavOptions) {
  const [urlDraft, setUrlDraft] = useState("");
  const [frameUrl, setFrameUrl] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const userNavRef = useRef(false);
  const bootstrapRef = useRef(false);

  useEffect(() => {
    if (!snapshot.url || userNavRef.current) return;
    setFrameUrl(snapshot.url);
    setUrlDraft(snapshot.url);
  }, [snapshot.url]);

  const syncPlaywright = useCallback(
    async (
      body: Record<string, unknown>,
    ): Promise<{ ok: boolean; url?: string }> => {
      setBusy(true);
      setRuntimeError(null);
      try {
        await requestDevBrowserRuntimeStart();
        const result = await runBrowserPanelAction(body, snapshot.sessionId, {
          capturePreview: false,
        });
        if (!result.ok) {
          setRuntimeError(result.message ?? "浏览器操作失败");
          return { ok: false };
        }
        if (result.patch) applySnapshot(result.patch);
        return { ok: true, url: result.patch?.url };
      } finally {
        setBusy(false);
      }
    },
    [applySnapshot, snapshot.sessionId],
  );

  const bootstrap = useCallback(async () => {
    setBootstrapping(true);
    setRuntimeError(null);
    try {
      if (snapshot.url) {
        setFrameUrl(snapshot.url);
        setUrlDraft(snapshot.url);
      }
    } finally {
      setBootstrapping(false);
    }
  }, [snapshot.url]);

  useEffect(() => {
    if (!enabled || bootstrapRef.current) return;
    bootstrapRef.current = true;
    void bootstrap();
  }, [bootstrap, enabled]);

  const navigateTo = useCallback(
    async (rawUrl: string, fromUser = true) => {
      const normalized = normalizeEmbeddedBrowserUrl(rawUrl);
      if (!normalized) return;
      if (fromUser) userNavRef.current = true;
      setFrameUrl(normalized);
      setUrlDraft(normalized);
      setRuntimeError(null);
      void syncPlaywright({
        action: "navigate",
        sessionId: snapshot.sessionId,
        url: normalized,
      }).finally(() => {
        userNavRef.current = false;
      });
    },
    [snapshot.sessionId, syncPlaywright],
  );

  const submitUrl = useCallback(() => {
    void navigateTo(urlDraft, true);
  }, [navigateTo, urlDraft]);

  const applyHistoryUrl = useCallback((nextUrl?: string) => {
    if (!nextUrl) return;
    setFrameUrl(nextUrl);
    setUrlDraft(nextUrl);
  }, []);

  const goBack = useCallback(() => {
    void syncPlaywright({ action: "back", sessionId: snapshot.sessionId }).then(
      (result) => {
        if (result.ok) applyHistoryUrl(result.url);
      },
    );
  }, [applyHistoryUrl, snapshot.sessionId, syncPlaywright]);

  const goForward = useCallback(() => {
    void syncPlaywright({
      action: "forward",
      sessionId: snapshot.sessionId,
    }).then((result) => {
      if (result.ok) applyHistoryUrl(result.url);
    });
  }, [applyHistoryUrl, snapshot.sessionId, syncPlaywright]);

  const reload = useCallback(() => {
    setReloadKey((k) => k + 1);
    void syncPlaywright({ action: "reload", sessionId: snapshot.sessionId });
  }, [snapshot.sessionId, syncPlaywright]);

  return {
    urlDraft,
    setUrlDraft,
    frameUrl,
    reloadKey,
    busy,
    bootstrapping,
    runtimeError,
    viewportRef,
    submitUrl,
    goBack,
    goForward,
    reload,
    retryBootstrap: bootstrap,
    syncPlaywright,
  };
}
