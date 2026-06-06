"use client";

import { useRef } from "react";
import {
  IconBrowserBack,
  IconBrowserForward,
  IconBrowserReload,
} from "@/components/browser/embedded-browser-icons";
import { EmbeddedWebView } from "@/components/browser/EmbeddedWebView";
import { useEmbeddedBrowser } from "@/lib/embedded-browser-context";
import { useEmbeddedBrowserNav } from "@/lib/use-embedded-browser-nav";
import { useTauriShell } from "@/lib/tauri-shell";

/** Side-panel browser: Tauri child WebView + Playwright sync for Agent tools. */
export function WorkspaceEmbeddedBrowser() {
  const { snapshot, applySnapshot } = useEmbeddedBrowser();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const isTauri = useTauriShell();

  const nav = useEmbeddedBrowserNav({
    snapshot,
    applySnapshot,
    enabled: true,
    viewportRef,
  });

  return (
    <section className="workspace-embedded-browser" aria-label="浏览器">
      <header className="workspace-explorer-head workspace-embedded-browser__head">
        <span className="workspace-explorer-title">浏览器</span>
        {snapshot.title ? (
          <span
            className="workspace-embedded-browser__page-title"
            title={snapshot.url}
          >
            {snapshot.title}
          </span>
        ) : (
          <span className="workspace-embedded-browser__page-title workspace-embedded-browser__page-title--empty">
            未打开页面
          </span>
        )}
        {isTauri ? (
          <span className="workspace-embedded-browser__badge" title="Tauri WebView2 子视图">
            WebView
          </span>
        ) : null}
      </header>

      <div className="workspace-embedded-browser__address-bar">
        <nav className="workspace-embedded-browser__nav" aria-label="导航">
          <button
            type="button"
            className="workspace-explorer-action"
            disabled={nav.busy || nav.bootstrapping || !isTauri}
            aria-label="后退"
            title="后退"
            onClick={nav.goBack}
          >
            <IconBrowserBack />
          </button>
          <button
            type="button"
            className="workspace-explorer-action"
            disabled={nav.busy || nav.bootstrapping || !isTauri}
            aria-label="前进"
            title="前进"
            onClick={nav.goForward}
          >
            <IconBrowserForward />
          </button>
          <button
            type="button"
            className="workspace-explorer-action"
            disabled={nav.busy || nav.bootstrapping || !isTauri}
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
          disabled={nav.busy || nav.bootstrapping || !isTauri}
          onChange={(e) => nav.setUrlDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") nav.submitUrl();
          }}
          placeholder={isTauri ? "输入 URL 后 Enter" : "需要桌面版 QuickerAgent"}
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
        className="workspace-embedded-browser__body embedded-browser__body"
        ref={viewportRef}
      >
        {nav.bootstrapping ? (
          <div className="embedded-browser__empty">正在初始化…</div>
        ) : (
          <EmbeddedWebView
            active
            url={nav.frameUrl}
            reloadKey={nav.reloadKey}
            hostRef={viewportRef}
          />
        )}
      </div>
    </section>
  );
}
