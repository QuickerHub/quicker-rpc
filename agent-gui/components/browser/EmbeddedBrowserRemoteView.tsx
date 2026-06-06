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
  onState?: (state: BrowserPanelStreamState) => void;
};

/** Renders Playwright Chromium via CDP screencast (no iframe). */
export function EmbeddedBrowserRemoteView({
  active,
  sessionId,
  hostRef,
  onState,
}: EmbeddedBrowserRemoteViewProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const stream = useBrowserPanelStream({
    active,
    sessionId,
    hostRef,
    onState,
  });

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

  if (stream.connecting && !stream.frameSrc) {
    return (
      <div className="embedded-browser__empty">正在连接独立浏览器进程…</div>
    );
  }

  if (!stream.frameSrc) {
    return (
      <div className="embedded-browser__empty">
        在地址栏输入 URL 后回车，或让 Agent 使用 browser 工具导航。
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
        src={stream.frameSrc}
        alt="Remote browser"
        draggable={false}
      />
      <p className="embedded-browser__remote-hint">
        点击画面后可键盘输入；滚轮滚动页面
      </p>
    </div>
  );
}
