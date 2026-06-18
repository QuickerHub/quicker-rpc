"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import {
  dismissAppMessage,
  pushAppMessage,
  useAppMessages,
  type AppMessage,
  type AppMessageAction,
} from "@/lib/app-messages";
import {
  computeAppMessageHostOffset,
  DEFAULT_APP_MESSAGE_HOST_OFFSET,
  type AppMessageHostOffset,
  type RectLike,
} from "@/lib/app-message-host-position";
import { subscribeEmbeddedWebViewBoundsRefresh } from "@/lib/embedded-webview-bounds-channel";

function AppMessageActions({
  message,
  onDismiss,
}: {
  message: AppMessage;
  onDismiss: (id: string) => void;
}) {
  const runAction = useCallback(
    async (action: AppMessageAction) => {
      try {
        await action.onClick?.();
      } finally {
        onDismiss(message.id);
      }
    },
    [message.id, onDismiss],
  );

  if (message.actions.length === 0) return null;

  return (
    <div className="app-message-actions">
      {message.actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className={action.primary ? "btn-primary app-message-action" : "btn-secondary app-message-action"}
          onClick={() => void runAction(action)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

function AppMessageProgressBar({
  progress,
}: {
  progress: NonNullable<AppMessage["progress"]>;
}) {
  const percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
  const indeterminate = percent <= 0;

  return (
    <div className="app-message-progress" aria-hidden={false}>
      <div className="app-message-progress-head">
        <span className="app-message-progress-pct">
          {indeterminate ? "…" : `${percent}%`}
        </span>
      </div>
      <div
        className="app-message-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : percent}
        aria-busy={indeterminate ? true : undefined}
      >
        <div
          className={`app-message-progress-fill${
            indeterminate ? " app-message-progress-fill--indeterminate" : ""
          }`}
          style={indeterminate ? undefined : { width: `${percent}%` }}
        />
      </div>
      {progress.message ? (
        <p className="app-message-progress-msg">{progress.message}</p>
      ) : null}
    </div>
  );
}

function AppMessageCard({
  message,
  onDismiss,
}: {
  message: AppMessage;
  onDismiss: (id: string) => void;
}) {
  const runPrimaryAction = useCallback(async () => {
    if (!message.onClick) return;
    try {
      await message.onClick();
    } finally {
      onDismiss(message.id);
    }
  }, [message, onDismiss]);

  const clickable = Boolean(message.onClick) && !message.progress;

  return (
    <div
      className={`app-message app-message--${message.kind}${
        message.progress ? " app-message--progress" : ""
      }${clickable ? " app-message--clickable" : ""}`}
      role={message.kind === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <div
        className="app-message-main"
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={
          clickable
            ? () => {
                void runPrimaryAction();
              }
            : undefined
        }
        onKeyDown={
          clickable
            ? (event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                void runPrimaryAction();
              }
            : undefined
        }
      >
        {message.title ? (
          <p className="app-message-title">{message.title}</p>
        ) : null}
        {message.progress ? (
          <AppMessageProgressBar progress={message.progress} />
        ) : (
          <p className="app-message-body">{message.body}</p>
        )}
        <AppMessageActions message={message} onDismiss={onDismiss} />
      </div>
      <button
        type="button"
        className="app-message-dismiss"
        onClick={() => onDismiss(message.id)}
        aria-label="关闭"
      >
        ×
      </button>
    </div>
  );
}

/** Regions covered by native child webviews that draw above all HTML. */
const NATIVE_WEBVIEW_HOST_SELECTOR = ".embedded-browser__native-host";

function collectNativeWebviewRects(): RectLike[] {
  const rects: RectLike[] = [];
  for (const el of document.querySelectorAll<HTMLElement>(
    NATIVE_WEBVIEW_HOST_SELECTOR,
  )) {
    if (!el.isConnected) continue;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    rects.push({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    });
  }
  return rects;
}

/** Shift the toast stack out from under native webviews (they paint above HTML). */
function useAppMessageHostOffset(
  hostRef: RefObject<HTMLDivElement | null>,
  messageCount: number,
): AppMessageHostOffset {
  const [offset, setOffset] = useState<AppMessageHostOffset>(
    DEFAULT_APP_MESSAGE_HOST_OFFSET,
  );

  useLayoutEffect(() => {
    if (messageCount === 0) return;

    const update = () => {
      const next = computeAppMessageHostOffset({
        webviewRects: collectNativeWebviewRects(),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        stackHeight: hostRef.current?.getBoundingClientRect().height ?? 0,
      });
      setOffset((prev) =>
        prev.right === next.right && prev.bottom === next.bottom ? prev : next,
      );
    };

    let rafId: number | null = null;
    const scheduleUpdate = () => {
      if (rafId != null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        update();
      });
    };

    update();
    window.addEventListener("resize", update);
    const unsubscribeBounds =
      subscribeEmbeddedWebViewBoundsRefresh(scheduleUpdate);
    // Catch browser panel mount/unmount, which emits no bounds message.
    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.removeEventListener("resize", update);
      unsubscribeBounds();
      observer.disconnect();
      if (rafId != null) window.cancelAnimationFrame(rafId);
    };
  }, [hostRef, messageCount]);

  return offset;
}

/** Bottom-right toast stack for non-blocking app notifications. */
export function AppMessageHost() {
  const messages = useAppMessages();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const offset = useAppMessageHostOffset(hostRef, messages.length);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.search.includes("preview-toast")) return;

    pushAppMessage({
      id: "preview-update",
      kind: "info",
      title: "QuickerAgent 更新",
      body: "有新版本 0.9.4.0（当前 0.9.3.0）",
      actions: [
        { label: "下载", primary: true },
        { label: "稍后" },
      ],
    });
    pushAppMessage({
      kind: "success",
      body: "动作已同步到 Quicker",
      autoDismissMs: 8000,
    });
  }, []);

  if (messages.length === 0) return null;

  const hostStyle: CSSProperties = {
    right: offset.right,
    bottom: offset.bottom,
  };

  return (
    <div
      ref={hostRef}
      className="app-message-host"
      style={hostStyle}
      aria-label="通知"
    >
      {messages.map((message) => (
        <AppMessageCard
          key={message.id}
          message={message}
          onDismiss={dismissAppMessage}
        />
      ))}
    </div>
  );
}
