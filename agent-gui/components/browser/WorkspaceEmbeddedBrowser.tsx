"use client";

import {
  IconBrowserBack,
  IconBrowserForward,
  IconBrowserReload,
} from "@/components/browser/embedded-browser-icons";
import { EmbeddedWebView } from "@/components/browser/EmbeddedWebView";
import { useEmbeddedBrowser } from "@/lib/embedded-browser-context";
import { useEmbeddedBrowserNav } from "@/lib/use-embedded-browser-nav";
import { useTauriShell } from "@/lib/tauri-shell";

/** Side-panel browser: native Tauri child WebView2 (human browsing only). */
export function WorkspaceEmbeddedBrowser() {
  const { snapshot, navigateSeq, navigateUrl, applySnapshot } =
    useEmbeddedBrowser();
  const isTauri = useTauriShell();

  const nav = useEmbeddedBrowserNav({
    snapshot,
    navigateSeq,
    navigateUrl,
    applySnapshot,
    enabled: isTauri,
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
          <span
            className="workspace-embedded-browser__badge"
            title="Tauri WebView2 子视图"
          >
            WebView
          </span>
        ) : null}
      </header>

      <div className="workspace-embedded-browser__address-bar">
        <nav className="workspace-embedded-browser__nav" aria-label="导航">
          <button
            type="button"
            className="workspace-explorer-action"
            disabled={!isTauri || !nav.canGoBack}
            aria-label="后退"
            title="后退"
            onClick={nav.goBack}
          >
            <IconBrowserBack />
          </button>
          <button
            type="button"
            className="workspace-explorer-action"
            disabled={!isTauri || !nav.canGoForward}
            aria-label="前进"
            title="前进"
            onClick={nav.goForward}
          >
            <IconBrowserForward />
          </button>
          <button
            type="button"
            className="workspace-explorer-action"
            disabled={!isTauri || !nav.frameUrl}
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
          disabled={!isTauri}
          onChange={(e) => nav.setUrlDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") nav.submitUrl();
          }}
          placeholder={isTauri ? "输入 URL 后 Enter" : "需要 QuickerAgent 桌面版"}
          spellCheck={false}
          aria-label="地址栏"
        />
      </div>

      <div className="workspace-embedded-browser__body embedded-browser__body">
        <EmbeddedWebView
          active={isTauri}
          url={nav.frameUrl}
          reloadKey={nav.reloadKey}
        />
      </div>
    </section>
  );
}
