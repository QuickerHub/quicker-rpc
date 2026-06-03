"use client";

import { useCallback, useEffect } from "react";
import {
  dismissAppMessage,
  pushAppMessage,
  useAppMessages,
  type AppMessage,
  type AppMessageAction,
} from "@/lib/app-messages";

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

function AppMessageCard({
  message,
  onDismiss,
}: {
  message: AppMessage;
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className={`app-message app-message--${message.kind}`}
      role={message.kind === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <div className="app-message-main">
        {message.title ? (
          <p className="app-message-title">{message.title}</p>
        ) : null}
        <p className="app-message-body">{message.body}</p>
        <AppMessageActions message={message} onDismiss={onDismiss} />
      </div>
      {message.dismissible ? (
        <button
          type="button"
          className={`app-message-dismiss${message.actions.length > 0 ? " app-message-dismiss--with-actions" : ""}`}
          onClick={() => onDismiss(message.id)}
          aria-label="关闭"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

/** Bottom-right toast stack for non-blocking app notifications. */
export function AppMessageHost() {
  const messages = useAppMessages();

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

  return (
    <div className="app-message-host" aria-label="通知">
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
