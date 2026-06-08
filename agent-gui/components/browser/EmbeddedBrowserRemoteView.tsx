"use client";

import {
  useCallback,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  useBrowserPanelStream,
  type BrowserPanelStreamState,
} from "@/lib/use-browser-panel-stream";

type EmbeddedBrowserRemoteViewProps = {
  active: boolean;
  sessionId: string;
  hostRef: RefObject<HTMLElement | null>;
  retryToken?: number;
  previewBase64?: string | null;
  previewMimeType?: string | null;
  onState?: (state: BrowserPanelStreamState) => void;
};

/** Renders Playwright Chromium via CDP screencast (no iframe). */
export function EmbeddedBrowserRemoteView({
  active,
  sessionId,
  hostRef,
  retryToken = 0,
  previewBase64 = null,
  previewMimeType = "image/jpeg",
  onState,
}: EmbeddedBrowserRemoteViewProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const stream = useBrowserPanelStream({
    active,
    sessionId,
    hostRef,
    retryToken,
    onState,
  });

  const fallbackPreviewSrc =
    previewBase64?.trim()
      ? `data:${previewMimeType ?? "image/jpeg"};base64,${previewBase64}`
      : null;
  const displaySrc = stream.frameSrc ?? fallbackPreviewSrc;

  const onSurfaceClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      stream.clickAt(event.clientX, event.clientY, rect);
      event.currentTarget.focus();
    },
    [stream],
  );

  const onSurfaceWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      stream.wheelAt(event.deltaX, event.deltaY);
    },
    [stream],
  );

  const onSurfaceKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        stream.typeText(event.key);
        return;
      }
      stream.pressKey(event.key);
    },
    [stream],
  );

  if (stream.error) {
    return (
      <div className="embedded-browser__empty">
        <span>{stream.error}</span>
        <button
          type="button"
          className="workspace-embedded-browser__error-retry"
          onClick={() => void stream.retryConnect()}
        >
          重试
        </button>
      </div>
    );
  }

  if (stream.connecting && !displaySrc) {
    return (
      <div className="embedded-browser__empty">正在连接 Playwright 浏览器进程…</div>
    );
  }

  if (!displaySrc) {
    return (
      <div className="embedded-browser__empty">
        <p>侧栏显示的是独立 Playwright Chromium（不是 Tauri 子 WebView2）。</p>
        <p className="embedded-browser__empty-hint">
          在地址栏输入 URL 后按 Enter，或让 Agent 使用 browser 工具 navigate。
        </p>
        {stream.connected ? (
          <p className="embedded-browser__empty-hint">已连接 browser-runtime，等待打开页面…</p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={surfaceRef}
      className="embedded-browser__remote-surface"
      role="application"
      aria-label="远程浏览器"
      tabIndex={0}
      onClick={onSurfaceClick}
      onWheel={onSurfaceWheel}
      onKeyDown={onSurfaceKeyDown}
    >
      <img
        className="embedded-browser__preview embedded-browser__preview--live"
        src={displaySrc}
        alt="Remote browser"
        draggable={false}
      />
      <p className="embedded-browser__remote-hint">
        {stream.frameSrc
          ? "实时画面 · 点击后可键盘输入 · 滚轮滚动"
          : "静态预览 · 等待实时流连接…"}
      </p>
    </div>
  );
}
