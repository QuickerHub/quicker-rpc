"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useEmbeddedBrowser } from "@/lib/embedded-browser-context";
import {
  BROWSER_PANEL_MIN_WIDTH,
  clampBrowserPanelWidth,
} from "@/lib/browser-panel-prefs";
import type { BrowserPanelInteractResponse } from "@/lib/browser-panel-types";

async function panelInteract(
  body: Record<string, unknown>,
): Promise<BrowserPanelInteractResponse> {
  const res = await fetch("/api/browser/panel", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as BrowserPanelInteractResponse;
}

function patchFromResponse(
  data: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!data) return null;
  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  if (typeof data.url === "string") patch.url = data.url;
  if (typeof data.title === "string") patch.title = data.title;
  if (typeof data.previewBase64 === "string") {
    patch.previewBase64 = data.previewBase64;
    patch.previewMimeType = data.previewMimeType ?? "image/jpeg";
  }
  if (typeof data.viewportWidth === "number") patch.viewportWidth = data.viewportWidth;
  if (typeof data.viewportHeight === "number") patch.viewportHeight = data.viewportHeight;
  if (typeof data.sessionId === "string") patch.sessionId = data.sessionId;
  return Object.keys(patch).length > 1 ? patch : null;
}

export function EmbeddedBrowserPanel() {
  const {
    open,
    width,
    snapshot,
    setOpen,
    setWidth,
    applySnapshot,
  } = useEmbeddedBrowser();
  const [urlDraft, setUrlDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewMode, setViewMode] = useState<"live" | "iframe">("live");
  const [iframeKey, setIframeKey] = useState(0);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setUrlDraft(snapshot.url);
  }, [snapshot.url]);

  const runPanelAction = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      try {
        const result = await panelInteract(body);
        if (!result.ok) {
          console.warn(result.message ?? "browser panel action failed");
          return;
        }
        const patch = patchFromResponse(result.data);
        if (patch) applySnapshot(patch);
        if (body.action === "navigate" || body.action === "reload") {
          setIframeKey((k) => k + 1);
        }
      } finally {
        setBusy(false);
      }
    },
    [applySnapshot],
  );

  const submitUrl = useCallback(() => {
    const url = urlDraft.trim();
    if (!url) return;
    void runPanelAction({
      action: "navigate",
      sessionId: snapshot.sessionId,
      url,
    });
  }, [runPanelAction, snapshot.sessionId, urlDraft]);

  const onPreviewClick = useCallback(
    (event: ReactMouseEvent<HTMLImageElement>) => {
      if (busy || !snapshot.previewBase64) return;
      const img = event.currentTarget;
      const rect = img.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = Math.round(
        ((event.clientX - rect.left) / rect.width) * snapshot.viewportWidth,
      );
      const y = Math.round(
        ((event.clientY - rect.top) / rect.height) * snapshot.viewportHeight,
      );
      void runPanelAction({
        action: "click_xy",
        sessionId: snapshot.sessionId,
        x,
        y,
      });
    },
    [busy, runPanelAction, snapshot.previewBase64, snapshot.sessionId, snapshot.viewportHeight, snapshot.viewportWidth],
  );

  const onResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      resizeRef.current = { startX: event.clientX, startWidth: width };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [width],
  );

  const onResizePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = resizeRef.current;
      if (!start) return;
      const delta = start.startX - event.clientX;
      setWidth(clampBrowserPanelWidth(start.startWidth + delta));
    },
    [setWidth],
  );

  const onResizePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    resizeRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  if (!open) return null;

  const previewSrc = snapshot.previewBase64
    ? `data:${snapshot.previewMimeType ?? "image/jpeg"};base64,${snapshot.previewBase64}`
    : null;

  return (
    <div
      className="app-main-browser-pane"
      style={{ width, minWidth: BROWSER_PANEL_MIN_WIDTH }}
      aria-label="内嵌浏览器"
    >
      <div
        className="app-main-browser-pane__resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整浏览器面板宽度"
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
      />
      <div className="embedded-browser">
        <div className="embedded-browser__toolbar">
          <div className="embedded-browser__nav">
            <button
              type="button"
              className="embedded-browser__btn"
              disabled={busy}
              title="后退"
              onClick={() => void runPanelAction({ action: "back", sessionId: snapshot.sessionId })}
            >
              ←
            </button>
            <button
              type="button"
              className="embedded-browser__btn"
              disabled={busy}
              title="前进"
              onClick={() => void runPanelAction({ action: "forward", sessionId: snapshot.sessionId })}
            >
              →
            </button>
            <button
              type="button"
              className="embedded-browser__btn"
              disabled={busy}
              title="刷新"
              onClick={() => void runPanelAction({ action: "reload", sessionId: snapshot.sessionId })}
            >
              ↻
            </button>
          </div>
          <input
            className="embedded-browser__url"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitUrl();
            }}
            placeholder="https://"
            spellCheck={false}
          />
          <div className="embedded-browser__modes">
            <button
              type="button"
              className={`embedded-browser__mode${viewMode === "live" ? " embedded-browser__mode--active" : ""}`}
              onClick={() => setViewMode("live")}
              title="Agent 视图（与工具同会话）"
            >
              Agent
            </button>
            <button
              type="button"
              className={`embedded-browser__mode${viewMode === "iframe" ? " embedded-browser__mode--active" : ""}`}
              onClick={() => setViewMode("iframe")}
              title="页面 iframe（部分站点可能拒绝嵌入）"
            >
              页面
            </button>
          </div>
          <button
            type="button"
            className="embedded-browser__btn embedded-browser__btn--close"
            title="关闭浏览器面板"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>
        {snapshot.title ? (
          <div className="embedded-browser__subtitle" title={snapshot.url}>
            {snapshot.title}
          </div>
        ) : null}
        <div className="embedded-browser__body" ref={previewRef}>
          {viewMode === "iframe" && snapshot.url ? (
            <iframe
              key={iframeKey}
              className="embedded-browser__iframe"
              src={snapshot.url}
              title={snapshot.title || "Embedded browser"}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : previewSrc ? (
            <img
              className="embedded-browser__preview"
              src={previewSrc}
              alt={snapshot.title || snapshot.url || "Browser preview"}
              onClick={onPreviewClick}
            />
          ) : snapshot.url ? (
            <iframe
              key={iframeKey}
              className="embedded-browser__iframe"
              src={snapshot.url}
              title={snapshot.title || "Embedded browser"}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : (
            <div className="embedded-browser__empty">
              使用 Agent 的 browser 工具导航，或在地址栏输入 URL 后回车。
            </div>
          )}
        </div>
        {viewMode === "live" && previewSrc ? (
          <div className="embedded-browser__hint">
            点击画面可转发点击到 Agent 浏览器；复杂登录建议在「页面」模式操作后让 Agent 继续。
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function BrowserPanelToggle({
  className,
}: {
  className?: string;
}) {
  const { open, toggleOpen } = useEmbeddedBrowser();
  return (
    <button
      type="button"
      className={className}
      aria-pressed={open}
      title={open ? "隐藏内嵌浏览器" : "显示内嵌浏览器"}
      onClick={toggleOpen}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <rect x="1.5" y="2.5" width="11" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.15" />
        <path d="M1.5 5h11" stroke="currentColor" strokeWidth="1.15" />
        <circle cx="3.25" cy="3.75" r="0.55" fill="currentColor" />
        <circle cx="4.75" cy="3.75" r="0.55" fill="currentColor" />
      </svg>
    </button>
  );
}
