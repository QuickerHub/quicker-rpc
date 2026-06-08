"use client";

import { useCallback, useRef } from "react";
import {
  IconBrowserBack,
  IconBrowserForward,
  IconBrowserReload,
} from "@/components/browser/embedded-browser-icons";
import { EmbeddedBrowserRemoteView } from "@/components/browser/EmbeddedBrowserRemoteView";
import { useEmbeddedBrowser } from "@/lib/embedded-browser-context";
import { useEmbeddedBrowserNav } from "@/lib/use-embedded-browser-nav";

/** Side-panel browser: Playwright automation + live screencast (Agent browser tool). */
export function WorkspaceEmbeddedBrowser() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const { snapshot, navigateSeq, navigateUrl, applySnapshot } =
    useEmbeddedBrowser();

  const nav = useEmbeddedBrowserNav({
    snapshot,
    navigateSeq,
    navigateUrl,
    applySnapshot,
    enabled: true,
  });

  const onStreamState = useCallback(
    (state: { url: string; title: string; viewportWidth: number; viewportHeight: number }) => {
      applySnapshot({
        url: state.url,
        title: state.title,
        viewportWidth: state.viewportWidth,
        viewportHeight: state.viewportHeight,
      });
    },
    [applySnapshot],
  );

  const pageLabel = snapshot.title?.trim()
    || snapshot.url?.trim()
    || "未打开页面";
  const pageLabelEmpty = !snapshot.title?.trim() && !snapshot.url?.trim();

  return (
    <section className="workspace-embedded-browser" aria-label="浏览器">
      <header className="workspace-explorer-head workspace-embedded-browser__head">
        <span className="workspace-explorer-title">浏览器</span>
        <span
          className={`workspace-embedded-browser__page-title${pageLabelEmpty ? " workspace-embedded-browser__page-title--empty" : ""}`}
          title={snapshot.url || undefined}
        >
          {pageLabel}
        </span>
        <span
          className="workspace-embedded-browser__badge"
          title="Playwright 自动化浏览器（Agent browser 工具）"
        >
          Playwright
        </span>
      </header>

      <div className="workspace-embedded-browser__address-bar">
        <nav className="workspace-embedded-browser__nav" aria-label="导航">
          <button
            type="button"
            className="workspace-explorer-action"
            disabled={nav.busy || nav.bootstrapping || !nav.canGoBack}
            aria-label="后退"
            title="后退"
            onClick={nav.goBack}
          >
            <IconBrowserBack />
          </button>
          <button
            type="button"
            className="workspace-explorer-action"
            disabled={nav.busy || nav.bootstrapping || !nav.canGoForward}
            aria-label="前进"
            title="前进"
            onClick={nav.goForward}
          >
            <IconBrowserForward />
          </button>
          <button
            type="button"
            className="workspace-explorer-action"
            disabled={nav.busy || nav.bootstrapping || !snapshot.url}
            aria-label="刷新"
            title="刷新"
            onClick={nav.reload}
          >
            <IconBrowserReload />
          </button>
        </nav>
        <input
          className="workspace-embedded-browser__url"
          value={nav.urlDraft}
          disabled={nav.busy || nav.bootstrapping}
          onChange={(e) => nav.setUrlDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") nav.submitUrl();
          }}
          placeholder="输入 URL 后 Enter，或让 Agent 使用 browser 工具"
          spellCheck={false}
          aria-label="地址栏"
        />
      </div>

      {nav.runtimeError ? (
        <div className="workspace-embedded-browser__error" role="alert">
          <span>{nav.runtimeError}</span>
          <button
            type="button"
            className="workspace-embedded-browser__error-retry"
            onClick={() => void nav.retryBootstrap()}
          >
            重试
          </button>
        </div>
      ) : null}

      <div
        ref={viewportRef}
        className="workspace-embedded-browser__body embedded-browser__body"
      >
        {nav.bootstrapping ? (
          <div className="embedded-browser__empty">正在启动 Playwright 浏览器…</div>
        ) : (
          <EmbeddedBrowserRemoteView
            active
            sessionId={nav.sessionId}
            hostRef={viewportRef}
            retryToken={nav.retryToken + nav.streamToken}
            previewBase64={snapshot.previewBase64}
            previewMimeType={snapshot.previewMimeType}
            onState={onStreamState}
          />
        )}
      </div>

      <p className="workspace-embedded-browser__hint">
        独立 Playwright 进程（:6017），与 QuickerAgent 主 WebView 分离；Agent 用 browser 工具操控同一 session。
      </p>
    </section>
  );
}
