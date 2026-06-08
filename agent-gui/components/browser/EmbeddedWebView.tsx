"use client";

import type { RefObject } from "react";
import { useEmbeddedWebView } from "@/lib/use-embedded-webview";

type EmbeddedWebViewProps = {
  active: boolean;
  url: string;
  reloadKey: number;
  boundsHostRef: RefObject<HTMLElement | null>;
};

/** Native embedded browser surface (Tauri child WebView only — no iframe). */
export function EmbeddedWebView({
  active,
  url,
  reloadKey,
  boundsHostRef,
}: EmbeddedWebViewProps) {
  const webview = useEmbeddedWebView({
    active,
    url,
    reloadKey,
    hostRef: boundsHostRef,
  });

  if (!webview.isTauri) {
    return (
      <div className="embedded-browser__empty embedded-browser__empty--desktop-only">
        <p>内嵌浏览器需要 QuickerAgent 桌面版（WebView2 子视图）。</p>
        <p className="embedded-browser__empty-hint">
          请使用已安装的 QuickerAgent，或在 agent-gui 目录运行{" "}
          <code>pnpm tauri:dev</code>。
        </p>
        <p className="embedded-browser__empty-hint">
          纯浏览器访问 localhost:3000 无法内嵌 WebView 组件。
        </p>
      </div>
    );
  }

  return (
    <div
      className="embedded-browser__native-host"
      onPointerDown={() => {
        void webview.focusWebview();
      }}
    >
      {!url && webview.state !== "error" ? (
        <div className="embedded-browser__empty embedded-browser__empty--overlay">
          在地址栏输入 URL 后回车开始浏览。
        </div>
      ) : null}
      {webview.state === "loading" ? (
        <div className="embedded-browser__empty embedded-browser__empty--overlay">
          正在加载 WebView…
        </div>
      ) : null}
      {webview.state === "error" ? (
        <div className="embedded-browser__empty">
          <span>{webview.error ?? "WebView 加载失败"}</span>
          <button
            type="button"
            className="workspace-embedded-browser__error-retry"
            onClick={() => void webview.remount()}
          >
            重试
          </button>
        </div>
      ) : null}
    </div>
  );
}
