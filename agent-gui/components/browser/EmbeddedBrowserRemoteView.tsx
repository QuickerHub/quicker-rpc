"use client";

import {
  useCallback,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { BrowserFrameCanvas } from "@/components/browser/BrowserFrameCanvas";
import {
  useBrowserPanelStream,
  type BrowserPanelStreamState,
} from "@/lib/use-browser-panel-stream";

type EmbeddedBrowserRemoteViewProps = {
  active: boolean;
  sessionId: string;
  retryToken?: number;
  previewBase64?: string | null;
  previewMimeType?: string | null;
  onState?: (state: BrowserPanelStreamState) => void;
  pickMode?: boolean;
  picking?: boolean;
  onPickAt?: (viewportX: number, viewportY: number) => void;
};

/** Renders Playwright Chromium via CDP screencast (no iframe). */
export function EmbeddedBrowserRemoteView({
  active,
  sessionId,
  retryToken = 0,
  previewBase64 = null,
  previewMimeType = "image/jpeg",
  onState,
  pickMode = false,
  picking = false,
  onPickAt,
}: EmbeddedBrowserRemoteViewProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const previewHostRef = useRef<HTMLDivElement | null>(null);
  const stream = useBrowserPanelStream({
    active,
    sessionId,
    hostRef: previewHostRef,
    retryToken,
    onState,
  });

  const previewRect = useCallback((): DOMRect | null => {
    return previewHostRef.current?.getBoundingClientRect() ?? null;
  }, []);

  const fallbackPreviewSrc =
    previewBase64?.trim()
      ? `data:${previewMimeType ?? "image/jpeg"};base64,${previewBase64}`
      : null;
  const displaySrc = stream.frameSrc ?? fallbackPreviewSrc;

  const onSurfaceClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const rect = previewRect();
      if (!rect) return;
      if (
        event.clientX < rect.left
        || event.clientX > rect.right
        || event.clientY < rect.top
        || event.clientY > rect.bottom
      ) {
        return;
      }
      if (pickMode && onPickAt) {
        event.preventDefault();
        const mapped = stream.mapClientToViewport(
          event.clientX,
          event.clientY,
          rect,
        );
        if (mapped) onPickAt(mapped.x, mapped.y);
        return;
      }
      stream.clickAt(event.clientX, event.clientY, rect);
      event.currentTarget.focus();
    },
    [onPickAt, pickMode, previewRect, stream],
  );

  const onSurfaceMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (pickMode) return;
      const rect = previewRect();
      if (!rect) return;
      stream.moveAt(event.clientX, event.clientY, rect);
    },
    [pickMode, previewRect, stream],
  );

  const onSurfaceWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      if (pickMode) return;
      event.preventDefault();
      event.stopPropagation();
      stream.wheelAt(event.deltaX, event.deltaY);
    },
    [pickMode, stream],
  );

  const onSurfaceKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (pickMode) return;
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
      className={`embedded-browser__remote-surface${pickMode ? " embedded-browser__remote-surface--pick" : ""}${picking ? " embedded-browser__remote-surface--picking" : ""}`}
      role="application"
      aria-label={pickMode ? "选择浏览器元素" : "远程浏览器"}
      tabIndex={0}
      onClick={onSurfaceClick}
      onMouseMove={onSurfaceMouseMove}
      onWheel={onSurfaceWheel}
      onKeyDown={onSurfaceKeyDown}
    >
      <BrowserFrameCanvas
        src={displaySrc}
        className="embedded-browser__preview embedded-browser__preview--live"
        containerRef={previewHostRef}
      />
      <p className="embedded-browser__remote-hint">
        {pickMode
          ? picking
            ? "正在识别元素…"
            : "选择模式 · 点击页面上的目标元素"
          : stream.frameSrc
            ? "实时画面 · 支持 hover、点击、键盘输入和滚轮滚动"
            : "静态预览 · 等待实时流连接…"}
      </p>
    </div>
  );
}
