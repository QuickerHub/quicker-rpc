"use client";

import { useCallback, useMemo, useRef } from "react";
import {
  IconBrowserBack,
  IconBrowserForward,
  IconBrowserNewTab,
  IconBrowserPickElement,
  IconBrowserReload,
} from "@/components/browser/embedded-browser-icons";
import { EmbeddedWebView } from "@/components/browser/EmbeddedWebView";
import { EmbeddedWebViewBoundsWatcher } from "@/components/browser/EmbeddedWebViewBoundsWatcher";
import type { BrowserPanelSnapshot } from "@/lib/browser-panel-types";
import { EMPTY_BROWSER_PANEL_SNAPSHOT } from "@/lib/browser-panel-types";
import {
  useEmbeddedBrowser,
  type ApplySnapshotOptions,
} from "@/lib/embedded-browser-context";
import { useEmbeddedBrowserTabs } from "@/lib/embedded-browser-tabs";
import { DEFAULT_EMBEDDED_BROWSER_ID } from "@/lib/embedded-browser-tauri";
import { useDesktopShell } from "@/lib/desktop-shell";
import { isElectronShell } from "@/lib/desktop-shell";
import { useEmbeddedBrowserElementPick } from "@/lib/use-embedded-browser-element-pick";
import { useEmbeddedBrowserNativeNav } from "@/lib/use-embedded-browser-native-nav";

type WorkspaceEmbeddedBrowserProps = {
  /** Embedded browser instance ("default" = thread-scoped agent browser). */
  browserId?: string;
};

/** Side-panel browser: Electron/Tauri native WebContentsView (no Playwright). */
export function WorkspaceEmbeddedBrowser({
  browserId = DEFAULT_EMBEDDED_BROWSER_ID,
}: WorkspaceEmbeddedBrowserProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const isDesktop = useDesktopShell();
  const isDefault = browserId === DEFAULT_EMBEDDED_BROWSER_ID;

  const defaultBrowser = useEmbeddedBrowser();
  const { tabs, addTab, updateTab } = useEmbeddedBrowserTabs();
  const tab = tabs.find((item) => item.id === browserId);

  const tabSnapshot = useMemo(
    (): BrowserPanelSnapshot => ({
      ...EMPTY_BROWSER_PANEL_SNAPSHOT,
      sessionId: browserId,
      url: tab?.url ?? "",
      title: tab?.title ?? "",
    }),
    [browserId, tab?.url, tab?.title],
  );

  const applyTabSnapshot = useCallback(
    (patch: Partial<BrowserPanelSnapshot>, _options?: ApplySnapshotOptions) => {
      updateTab(browserId, {
        ...(patch.url !== undefined ? { url: patch.url } : {}),
        ...(patch.title !== undefined ? { title: patch.title } : {}),
      });
    },
    [browserId, updateTab],
  );

  const snapshot = isDefault ? defaultBrowser.snapshot : tabSnapshot;
  const applySnapshot = isDefault
    ? defaultBrowser.applySnapshot
    : applyTabSnapshot;

  const nav = useEmbeddedBrowserNativeNav({
    snapshot,
    navigateSeq: isDefault ? defaultBrowser.navigateSeq : 0,
    navigateUrl: isDefault ? defaultBrowser.navigateUrl : null,
    applySnapshot,
    enabled: isDesktop,
    browserId,
  });

  const pick = useEmbeddedBrowserElementPick(browserId);
  const canPick = isDesktop && isElectronShell() && Boolean(nav.displayUrl);
  const canAddTab = isDesktop && isElectronShell();

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
          title="Electron 内置 Chromium 子视图"
        >
          内置
        </span>
      </header>

      <div className="workspace-embedded-browser__address-bar">
        <nav className="workspace-embedded-browser__nav" aria-label="导航">
          <button
            type="button"
            className="workspace-explorer-action"
            disabled={!isDesktop || nav.busy || !nav.canGoBack}
            aria-label="后退"
            title="后退"
            onClick={nav.goBack}
          >
            <IconBrowserBack />
          </button>
          <button
            type="button"
            className="workspace-explorer-action"
            disabled={!isDesktop || nav.busy || !nav.canGoForward}
            aria-label="前进"
            title="前进"
            onClick={nav.goForward}
          >
            <IconBrowserForward />
          </button>
          <button
            type="button"
            className="workspace-explorer-action"
            disabled={!isDesktop || nav.busy || !nav.displayUrl}
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
          disabled={!isDesktop || nav.busy}
          onChange={(e) => nav.setUrlDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") nav.submitUrl();
          }}
          placeholder="输入 URL 后 Enter，或让 Agent 使用 browser 工具打开页面"
          spellCheck={false}
          aria-label="地址栏"
        />
        <nav
          className="workspace-embedded-browser__nav workspace-embedded-browser__nav--tools"
          aria-label="浏览器工具"
        >
          <button
            type="button"
            className={`workspace-explorer-action workspace-embedded-browser__pick-btn${pick.picking ? " workspace-embedded-browser__pick-btn--active" : ""}`}
            disabled={!canPick}
            aria-label="选择页面元素"
            aria-pressed={pick.picking}
            title={
              pick.picking
                ? "正在选取：点击页面元素加入对话（Esc 取消）"
                : "选择页面元素，将其上下文添加到对话输入框"
            }
            onClick={() => void pick.togglePick()}
          >
            <IconBrowserPickElement />
          </button>
          {canAddTab ? (
            <button
              type="button"
              className="workspace-explorer-action"
              aria-label="新建浏览器标签页"
              title="新建浏览器标签页"
              onClick={() => addTab()}
            >
              <IconBrowserNewTab />
            </button>
          ) : null}
        </nav>
      </div>

      <div
        ref={viewportRef}
        className="workspace-embedded-browser__body embedded-browser__body"
      >
        <EmbeddedWebViewBoundsWatcher hostRef={viewportRef} enabled={isDesktop} />
        <EmbeddedWebView
          active={isDesktop}
          url={nav.displayUrl}
          reloadKey={nav.reloadKey}
          boundsHostRef={viewportRef}
          browserId={browserId}
        />
      </div>

      <p className="workspace-embedded-browser__hint">
        {pick.pickError
          ? `元素选取失败：${pick.pickError}`
          : pick.picking
            ? "选取模式：移动鼠标高亮元素，点击加入对话输入框，Esc 取消。"
            : isDesktop
              ? "Electron 内置浏览器子视图，Cookie 与登录态保存在本机用户目录。"
              : "内嵌浏览器仅在 QuickerAgent 桌面版可用；请安装桌面应用或使用 dev.ps1 -Electron。"}
      </p>
    </section>
  );
}
