"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { runBrowserPanelAction } from "@/lib/browser-panel-client";
import { requestBrowserRuntimeStart } from "@/lib/browser-dev-runtime";
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

/** Address bar + Playwright browser-runtime actions for the side-panel automation view. */
export function useEmbeddedBrowserNav({
  snapshot,
  navigateSeq,
  navigateUrl,
  applySnapshot,
  enabled,
}: UseEmbeddedBrowserNavOptions) {
  const sessionId = snapshot.sessionId?.trim() || "default";
  const [urlDraft, setUrlDraft] = useState(snapshot.url ?? "");
  const [busy, setBusy] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [streamToken, setStreamToken] = useState(0);
  const lastNavigateSeqRef = useRef(0);
  const bootstrapAttemptRef = useRef(0);

  useEffect(() => {
    if (!snapshot.url) return;
    setUrlDraft(snapshot.url);
  }, [snapshot.url]);

  const bootstrap = useCallback(async () => {
    if (!enabled) {
      setBootstrapping(false);
      return;
    }

    const attempt = bootstrapAttemptRef.current + 1;
    bootstrapAttemptRef.current = attempt;
    setBootstrapping(true);
    setRuntimeError(null);

    try {
      const started = await requestBrowserRuntimeStart();
      if (attempt !== bootstrapAttemptRef.current) return;
      if (!started) {
        setRuntimeError(
          "无法启动 browser-runtime。请运行: pnpm browser:install && pnpm browser:dev-server",
        );
        return;
      }
    } finally {
      if (attempt === bootstrapAttemptRef.current) {
        setBootstrapping(false);
      }
    }
  }, [enabled]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap, retryToken]);

  const runAction = useCallback(
    async (body: Record<string, unknown>) => {
      if (!enabled) return;
      setBusy(true);
      setRuntimeError(null);
      try {
        const result = await runBrowserPanelAction(
          { sessionId, ...body },
          sessionId,
          { capturePreview: true },
        );
        if (!result.ok) {
          setRuntimeError(result.message ?? "浏览器操作失败");
          return;
        }
        if (result.patch) {
          applySnapshot(result.patch);
          setStreamToken((token) => token + 1);
        }
      } finally {
        setBusy(false);
      }
    },
    [applySnapshot, enabled, sessionId],
  );

  useEffect(() => {
    if (!enabled || !navigateUrl || navigateSeq <= lastNavigateSeqRef.current) {
      return;
    }
    lastNavigateSeqRef.current = navigateSeq;
    void runAction({ action: "navigate", url: navigateUrl });
  }, [enabled, navigateSeq, navigateUrl, runAction]);

  const submitUrl = useCallback(() => {
    const normalized = normalizeEmbeddedBrowserUrl(urlDraft);
    if (!normalized) return;
    void runAction({ action: "navigate", url: normalized });
  }, [runAction, urlDraft]);

  const goBack = useCallback(() => {
    void runAction({ action: "back" });
  }, [runAction]);

  const goForward = useCallback(() => {
    void runAction({ action: "forward" });
  }, [runAction]);

  const reload = useCallback(() => {
    void runAction({ action: "reload" });
  }, [runAction]);

  const retryBootstrap = useCallback(() => {
    setRetryToken((token) => token + 1);
  }, []);

  return {
    sessionId,
    urlDraft,
    setUrlDraft,
    busy,
    bootstrapping,
    runtimeError,
    retryToken,
    streamToken,
    canGoBack: Boolean(snapshot.url),
    canGoForward: Boolean(snapshot.url),
    submitUrl,
    goBack,
    goForward,
    reload,
    retryBootstrap,
  };
}
